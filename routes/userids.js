var User = require('../models/user.js');
var Task = require('../models/task.js');

module.exports = function (router) {
    const useridRoute = router.route('/users/:id');

    // GET 
    useridRoute.get(async function (req, res) {
        try {
            let select;
            if (req.query && req.query["select"]) {
                select = JSON.parse(req.query["select"]);
            }

            let query = User.findById(req.params["id"]);
            if (select) query = query.select(select);

            const user = await query.exec();
            if (!user) return res.status(404).json({ message: 'User not found', data: null });

            return res.status(200).json({ message: 'User Retrieved', data: user });
        } catch (err) {
            return res.status(400).json({ message: 'Bad Request', data: err.message });
        }
    });

    // PUT 
    useridRoute.put(async function (req, res) {
        try {
            // Error check Required fields
            if (!req.body["name"] || !req.body["email"]) return res.status(400).json({ message: 'Name and email are required', data: null });

            // Look up user
            const user = await User.findById(req.params["id"]).exec();
            if (!user) return res.status(404).json({ message: 'User not found', data: null });

            // Ensure unique email
            const existing = await User.findOne({ email: req.body["email"], _id: { $ne: user._id } }).exec();
            if (existing) return res.status(400).json({ message: 'Email already in use', data: null });
            
            // Find which tasks to keep, add & remove
            const oldPending = Array.isArray(user.pendingTasks) ? user.pendingTasks.map(String) : [];
            const newPending = Array.isArray(req.body["pendingTasks"]) ? req.body["pendingTasks"].map(String) : [];

            const toAdd = newPending.filter(id => !oldPending.includes(id));
            const toRemove = oldPending.filter(id => !newPending.includes(id));

            // Validate Tasks exists, is not completed & not assigned to other users
            if (toAdd.length) {
                const tasks = await Task.find({ _id: { $in: toAdd } }).exec();
                const foundIds = tasks.map(t => t._id.toString());
                const notFound = toAdd.filter(id => !foundIds.includes(id));

                if (notFound.length) {
                    return res.status(400).json({ message: 'One or more pendingTasks not found', data: notFound });
                }

                const completedTasks = tasks.filter(t => t.completed === true);
                if (completedTasks.length) {
                    const completedIds = completedTasks.map(t => t._id.toString());
                    return res.status(400).json({ message: 'One or more pendingTasks are already completed', data: completedIds });
                }
                
                const conflicts = tasks.filter(t => t.assignedUser && t.assignedUser !== "" && t.assignedUser !== user._id.toString());
                if (conflicts.length) {
                    const conflictIds = conflicts.map(t => t._id.toString());
                    return res.status(400).json({ message: 'One or more tasks already assigned to another user. Use the Task PUT method to assign tasks to a user.', data: conflictIds });
                }
            }

            // Wrap task updates and user update in a transaction
            try {
                await User.db.transaction(async (session) => {
                    // Update Tasks
                    if (toAdd.length) {
                        await Task.updateMany(
                            { _id: { $in: toAdd } },
                            { $set: { assignedUser: user._id.toString(), assignedUserName: req.body["name"] } },
                            { session }
                        ).exec();
                    }
                    if (toRemove.length) {
                        await Task.updateMany(
                            { _id: { $in: toRemove } },
                            { $set: { assignedUser: '', assignedUserName: 'unassigned' } },
                            { session }
                        ).exec();
                    }

                    // Update User
                    user.name = req.body["name"];
                    user.email = req.body["email"];
                    user.pendingTasks = newPending;
                    await user.save({ session });
                });

                return res.status(200).json({ message: 'User Updated', data: user });
            } catch (err) {
                if (err.code === 11000) {
                    return res.status(400).json({ message: 'Email must be unique', data: null });
                }
                return res.status(500).json({ message: 'Server error', data: err.message });
            }
        } catch (err) {
            return res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    // DELETE 
    useridRoute.delete(async function (req, res) {
        try {
            // Look up & ensure user exists
            const user = await User.findById(req.params["id"]).exec();
            if (!user) return res.status(404).json({ message: 'User not found', data: null });

            // Wrap task unassignment and user deletion in a transaction
            try {
                await User.db.transaction(async (session) => {
                    // Unassign tasks
                    await Task.updateMany(
                        { $or: [ { assignedUser: user._id.toString() }, { _id: { $in: user.pendingTasks } } ] },
                        { $set: { assignedUser: '', assignedUserName: 'unassigned' } },
                        { session }
                    ).exec();

                    // Delete the user
                    await user.remove({ session });
                });

                return res.status(204).send(); 
            } catch (err) {
                return res.status(500).json({ message: 'Server error', data: err.message });
            }
        } catch (err) {
            return res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    return router;
};


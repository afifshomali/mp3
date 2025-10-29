var User = require('../models/user.js');
var Task = require('../models/task.js');


module.exports = function (router) {
    const userRoute = router.route('/users');

    // GET 
    userRoute.get(async function (req, res) {
        // Set up query object using Devlab tips 
        const query = User.find();
        query.collection(User.collection);
        
        // Apply passed query parameters
        if (req.query["where"]) {
            query.where(JSON.parse(req.query["where"]));
        }   
        if (req.query["sort"]) {
            query.sort(JSON.parse(req.query["sort"]));
        }
        if (req.query["select"]) {
            query.select(JSON.parse(req.query["select"]));
        }
        if (req.query["skip"]) {
            query.skip(parseInt(req.query["skip"]));
        }
        if (req.query["limit"]) {
            query.limit(parseInt(req.query["limit"]));
        }

        // Check if just to return count
        if (req.query["count"] === "'true'" || req.query["count"] === '"true"' || req.query["count"] === true) {
            try {
                const cnt = await query.countDocuments().exec();
                return res.status(200).json({ message: 'User Count Retrieved', data: cnt });
            } catch (err) {
                return res.status(400).json({ message: 'Bad Request', data: err.message });
            }
        }

        // Execute query
        try {
            const users = await query.exec();
            return res.status(200).json({ message: 'User List Retrieved', data: users });
        } catch (err) {
            return res.status(400).json({ message: 'Bad Request', data: err.message });
        }
    });

    // POST 
    userRoute.post(async function (req, res) {
        // Use mongoose for schema validation
        const newUser = new User(req.body);
        const err = newUser.validateSync();

        if (err) {
            return res.status(400).json({ message: 'Name and email are required', data: null });
        }

        // Pull in Pending Tasks if provided
        const pendingTasks = Array.isArray(req.body["pendingTasks"]) ? req.body["pendingTasks"].map(String) : [];

        // Validate Tasks exists, is not completed & not assigned to other users
        if (pendingTasks.length !== 0) {
            const tasks = await Task.find({ _id: { $in: pendingTasks } }).exec();
            const foundIds = tasks.map(t => t._id.toString());
            const notFound = pendingTasks.filter(id => !foundIds.includes(id));

            if (notFound.length) {
                return res.status(400).json({ message: 'One or more pendingTasks not found', data: notFound });
            }

            const incompleteTasks = tasks.filter(t => t.completed === false);
            if (incompleteTasks.length !== tasks.length) {
                const completedIds = tasks.filter(t => t.completed === true).map(t => t._id.toString());
                return res.status(400).json({ message: 'One or more pendingTasks are already completed', data: completedIds });
            }

            const conflicts = tasks.filter(t => t.assignedUser && t.assignedUser !== "");

            if (conflicts.length) {
                const conflictIds = conflicts.map(t => t._id.toString());
                return res.status(400).json({ message: 'One or more tasks already assigned to another user. Use the Task PUT method to re-assign tasks to a user.', data: conflictIds });
            }
        }


        // Save the new user and update tasks in the same transaction
        let savedUser; // Declare savedUser in the outer scope to ensure it is accessible
        try {
            await User.db.transaction(async (session) => {
                // Save the new user
                savedUser = await newUser.save({ session });

                // Update Tasks to assign to new user
                if (pendingTasks.length) {
                    await Task.updateMany(
                        { _id: { $in: pendingTasks } },
                        { $set: { assignedUser: savedUser._id.toString(), assignedUserName: savedUser.name } },
                        { session }
                    ).exec();
                }

                return res.status(201).json({ message: 'Created User', data: savedUser });
            });
        } catch (err) {
            // Duplicate key error for unique email
            if (err.code === 11000) {
                return res.status(400).json({ message: 'Email already exists', data: null });
            }
            return res.status(500).json({ message: 'Server error', data: err.message });
        }

    });

    return router;
};

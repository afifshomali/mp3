var User = require('../models/user.js');
var Task = require('../models/task.js');


module.exports = function (router) {
    const taskIdsRoute = router.route('/taskids');
    const taskIdRoute = router.route('/tasks/:id');

    // GET
   
    taskIdRoute.get(async function (req, res) {
        try {
            let select;
            if (req.query && req.query["select"]) {
                select = JSON.parse(req.query["select"]);
            }
            

            let query = Task.findById(req.params["id"]);
            if (select) query = query.select(select);

            const task = await query.exec();
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: null });
            }

            return res.status(200).json({ message: 'Task Retrieved', data: task });
        } catch (err) {
            return res.status(400).json({ message: 'Bad Request', data: err.message });
        }
    });

    // PUT
    taskIdRoute.put(async function (req, res) {
        try {
            // Validate required fields
            if (!req.body["name"] || !req.body["deadline"]) {
                return res.status(400).json({ message: 'Name and deadline are required', data: null });
            }

            // Find the task
            const task = await Task.findById(req.params["id"]).exec();
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: null });
            }

            // Make sure assigned user exists & their name matches the user ID name
            const assignedUserId = req.body["assignedUser"] ? String(req.body["assignedUser"]) : "";
            const incomingAssignedUserName = req.body["assignedUserName"] ? req.body["assignedUserName"] : "";
            const completed = req.body["completed"] ? req.body["completed"] === "true" || req.body["completed"] === true : false;
            
            let assignedUserName = 'unassigned';
            if (assignedUserId !== "") {
                try {
                    const user = await User.findById(assignedUserId).exec();
                    if (!user) {
                        return res.status(400).json({ message: 'Assigned user not found', data: assignedUserId });
                    }
                    if (incomingAssignedUserName !== user.name) {
                        return res.status(400).json({ message: 'assignedUserName does not match the looked-up user', data: { provided: incomingAssignedUserName, expected: user.name } });
                    }
                    assignedUserName = user.name;
                } catch (err) {
                    return res.status(500).json({ message: 'Server error while validating assigned user', data: err.message });
                }
            }

            // Handle pendingTasks updates for assigned users

            // Wrap pendingTasks updates and task save in a transaction using Task.db.transaction
            try {
                await Task.db.transaction(async (session) => {
                    // Remove task from previous user's pendingTasks if reassigned or marked complete
                    if (task.assignedUser !== "" && (task.assignedUser !== assignedUserId || completed === true)) {
                        await User.updateOne(
                            { _id: task.assignedUser },
                            { $pull: { pendingTasks: task._id.toString() } },
                            { session }
                        ).exec();
                    }

                    // Add task to user's pendingTasks if task is incomplete
                    if (assignedUserId !== "" && completed === false) {
                        await User.updateOne(
                            { _id: assignedUserId },
                            { $addToSet: { pendingTasks: task._id.toString() } },
                            { session }
                        ).exec();
                    }

                    // Update task fields
                    task.name = req.body["name"];
                    task.deadline = req.body["deadline"];
                    task.description = req.body["description"] ? req.body["description"] : "No description";
                    task.completed = completed;
                    task.assignedUser = assignedUserId;
                    task.assignedUserName = assignedUserName;

                    await task.save({ session });
                });

                return res.status(200).json({ message: 'Task Updated', data: task });
            } catch (err) {
                return res.status(500).json({ message: 'Server error', data: err.message });
            }
        } catch (err) {
            return res.status(500).json({ message: 'Server error', data: err.message });
        }
    });

    // DELETE
    // Delete a task or return 404 if not found
    // Ensure task is removed from assignedUser's pendingTasks
    taskIdRoute.delete(async function (req, res) {
        try {
            // Find the task
            const task = await Task.findById(req.params["id"]).exec();
            if (!task) {
                return res.status(404).json({ message: 'Task not found', data: null });
            }

            try {
                await Task.db.transaction(async (session) => {
                    // Remove task from assigned user's pendingTasks
                    if (task.assignedUser !== "") {
                        await User.updateOne(
                            { _id: task.assignedUser },
                            { $pull: { pendingTasks: task._id.toString() } },
                            { session }
                        ).exec();
                    }

                    // Delete the task
                    await task.remove({ session });
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


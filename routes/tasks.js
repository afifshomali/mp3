var User = require('../models/user.js');
var Task = require('../models/task.js');


module.exports = function (router) {
    const tasksRoute = router.route('/tasks');
    // GET
    tasksRoute.get(async function (req, res) {
        const query = Task.find();
        query.collection(Task.collection);

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
        } else {
            query.limit(100);
        }

        if (req.query["count"] === 'true' || req.query["count"] === true) {
            try {
                const cnt = await query.countDocuments().exec();
                return res.status(200).json({ message: 'Task Count Retrieved', data: cnt });
            } catch (err) {
                return res.status(400).json({ message: 'Bad Request', data: err.message });
            }
        }

        try {
            const tasks = await query.exec();
            return res.status(200).json({ message: 'Task List Retrieved', data: tasks });
        } catch (err) {
            return res.status(400).json({ message: 'Bad Request', data: err.message });
        }
    });

    // POST 
    tasksRoute.post(async function (req, res) {
        // Use mongoose for schema validation
        const newTask = new Task(req.body);
        const err = newTask.validateSync();

        if (err) {
            return res.status(400).json({ message: 'Name & Deadline are required', data: err.errors });
        }

        // Pull in assigned user info
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
        // Save the task and update the user's pending tasks in the same transaction
        let savedTask; // Declare savedTask in the outer scope to ensure it is accessible
        try {
            await Task.db.transaction(async (session) => {
                // Save the task
                savedTask = await newTask.save({ session });

                // Update the user's pending tasks
                if (assignedUserId && !completed) {
                    await User.updateOne(
                        { _id: assignedUserId },
                        { $addToSet: { pendingTasks: savedTask._id.toString() } },
                        { session }
                    ).exec();
                }
            });

            return res.status(201).json({ message: 'Created Task', data: savedTask });
        } catch (err) {
            return res.status(500).json({ message: 'Error Saving Task or Updating User', data: err.message });
        }
    });

    
    return router;
};


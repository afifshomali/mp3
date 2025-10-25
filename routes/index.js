/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
    app.use('/api', require('./home.js')(router));
    app.use('/api/users', require('./users.js')(router));
    app.use('/api/tasks', require('./tasks.js')(router));
    app.use('/api/users/:id', require('./userids.js')(router));
    app.use('/api/tasks/:id', require('./taskids.js')(router));
};

// Load required packages
var mongoose = require('mongoose');

// Define our user schema
var UserSchema = new mongoose.Schema({
    name: {type: String, required: [true, "Name is required"]},
    email: {type: String, required: [true, "Email is required"], unique: true},
    pendingTasks: [String]
}, {
    timestamps: { createdAt: 'dateCreated', updatedAt: false }
});

// Export the Mongoose model
module.exports = mongoose.model('User', UserSchema);

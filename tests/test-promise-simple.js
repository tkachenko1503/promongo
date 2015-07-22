var assert = require('assert');
var mongojs = require('../index');
var db = mongojs('test', ['a','b']);

db.a.find().toArray().then(function(docs) {
	assert.equal(docs.length, 0);
	db.close();
});

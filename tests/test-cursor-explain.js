var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world1'
},{
	hello:'world2'
}], function(db, done) {
	var cursor = db.a.find();
	cursor.explain(function(err, result) {
		assert.ok(!err);
		assert.equal(result.executionStats.totalDocsExamined, 1);
		done();
	});
});

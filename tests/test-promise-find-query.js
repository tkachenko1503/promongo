var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world1'
}, {
	hello:'world2'
}], function(db, done) {
	db.a.find({hello:'world2'})
		.toArray()
		.then(function(docs) {
			assert.equal(docs.length, 1);
			assert.equal(docs[0].hello, 'world2');
			done();
		});
});

var assert = require('assert');
var insert = require('./insert');

insert([{
	hello:'world'
}], function(db, done) {
	var sync = true;
	db.a.update({hello:'world'}, {$set:{hello:'verden'}})
		.then(function(lastErrorObject) {
			assert.ok(!sync);
			assert.equal(lastErrorObject.nModified, 1);
			assert.equal(lastErrorObject.n, 1);
			done();
		});
	sync = false;
});

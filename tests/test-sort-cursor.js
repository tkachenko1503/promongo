var assert = require('assert');
var insert = require('./insert');

insert([
    { _id: 1, item: { category: "cake", type: "chiffon" }, amount: 10 },
    { _id: 2, item: { category: "cookies", type: "chocolate chip" }, amount: 50 },
    { _id: 3, item: { category: "cookies", type: "chocolate chip" }, amount: 15 },
    { _id: 4, item: { category: "cake", type: "lemon" }, amount: 30 },
    { _id: 5, item: { category: "cake", type: "carrot" }, amount: 20 },
    { _id: 6, item: { category: "brownies", type: "blondie" }, amount: 10 }
], function(db, done) {
  var result = db.a
      .find()
      .sort( {amount: -1} )
      .toArray()
      .then(function (res) {
        assert.equal(res[0].amount, 50);
        assert.equal(res[1].amount, 30);
        assert.equal(res[2].amount, 20);
        done();
      })
      .catch(function(err){
        throw err;
        process.exit(1);
      });
});

var assert = require('assert');
var insert = require('./insert');

insert([{
    "_id": "10280",
    "city": "NEW YORK",
    "state": "NY",
    "pop": 51074,
    "loc": [
        -74.016323,
        40.710537
    ]
}, {
    "_id": "10350",
    "city": "LOS ANGELES",
    "state": "LA",
    "pop": 5574,
    "loc": [
        -23.016323,
        55.710537
    ]
}, {
    "_id": "1035230",
    "city": "SOME",
    "state": "LA",
    "pop": 10000,
    "loc": [
        -23.016323,
        55.710537
    ]
}], function(db, done) {
    db.a.aggregate([
        { $group: { _id: "$state", totalPop: { $sum: "$pop" } } },
        { $match: { totalPop: { $gte: 10000 } } }
    ]).then(function (result) {
        var item = result[0];

        assert.equal(item._id, 'LA');
        assert.equal(item.totalPop, 15574);

        done();
    });
});

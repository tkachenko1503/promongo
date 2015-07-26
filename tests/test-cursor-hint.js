var assert = require('assert');
var mongojs = require('../index');
var db = mongojs('test', ['users']);

db.users.drop()
    .then(function () {
        return db.users.insert([
            {
                name: 'first',
                age: 23
            }, {
                name: 'second',
                age: 15
            }
        ])
    })
    .then(function () {
        return db.users.createIndex('age');
    })
    .then(function (indexName) {
        assert.equal(indexName, 'age_1');

        return db.users.find().hint('age_1');
    }).then(function (res) {
        assert.equal(res.length, 2);
        assert.ok(res[0]._id);
        assert.ok(res[1]._id);
        db.close();
    });

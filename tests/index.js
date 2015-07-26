#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;

//================================================================
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
    })
		.catch(function (error) {
			console.log(error);
		});

//================================================================

var TIMEOUT = 20000;

var tests = fs.readdirSync(__dirname).filter(function(file) {
	return !fs.statSync(path.join(__dirname,file)).isDirectory();
}).filter(function(file) {
	return /^test(-|_|\.).*\.js$/i.test(file);
}).sort();

var cnt = 0;
var all = tests.length;
var args = process.argv.slice(2);

if (args.length === 1){
	var skip = +args[0];
	// if skip is integer
	if (skip % 1 === 0) {
		tests = tests.slice(skip);
		cnt = skip;
	}
}

var loop = function() {
	var next = tests.shift();

	if (!next) return console.log('\033[32m[ok]\033[39m  all ok');

	exec('node '+path.join(__dirname,next), {timeout:TIMEOUT}, function(err) {
		cnt++;

		if (err) {
			console.error('\033[31m[err]\033[39m '+cnt+'/'+all+' - '+next);
			console.error('Message - ', err.message);
			console.error('\n      '+(''+err.stack).split('\n').join('\n      ')+'\n');
			return process.exit(1);
		}

		console.log('\033[32m[ok]\033[39m  '+cnt+'/'+all+' - '+next);
		setTimeout(loop, 100);
	});
};

loop();

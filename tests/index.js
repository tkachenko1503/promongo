#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;

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

	if (!next) {
        console.log('\033[32m[ok]\033[39m  all ok');
        return process.exit(0);
    }

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

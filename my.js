var pmongo = require('./index');
var db = pmongo('mongodb://127.0.0.1:27017/original', ['users']);

db.users
    .insert({name: 'Serg', type: 'cool gay'})
    .then(function(){
        console.log(arguments);
    });

db.users
    .find()
    .then(function(){
        console.log(arguments);
    });

db.users
    .find({name: 'Serg'})
    .toArray()
    .then(function(docs){
        console.log(docs);
        db.close();
    });

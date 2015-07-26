var mongodb = require('mongodb');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Readable = require('stream').Readable || require('readable-stream');

var DriverCollection = mongodb.Collection.prototype;
var DriverDb = mongodb.Db.prototype;

/**
 * Executes the given function for each method in the old prototype, which doesn't have a
 * corresponding property in the new prototype.
 */
var forEachMethod = function (oldProto, newProto, fn) {
  Object.keys(oldProto).forEach(function (methodName) {
    if (Object.getOwnPropertyDescriptor(oldProto, methodName).get || newProto[methodName]) return;
    if (methodName[0] === '_' || typeof oldProto[methodName] !== 'function') return;
    fn(methodName, oldProto[methodName]);
  });
};


/**
 * Lazily evaulates an asynchronous callback, once.
 */
var thunk = function (callback) {
  var ran = false,
  cache = null;

  return function () {
    if (ran) {
      // just return the resolved promise.
      return cache;
    } else {
      ran = true;
      return cache = callback();
    }
  };
};


/**
 * Splits the args into args + callback.
 */
var splitArgs = function (args) {
  args = Array.prototype.slice.call(args);
  var callback = args[args.length - 1];

  if (typeof callback === 'function') {
    args.pop();
  } else {
    callback = false;
  }

  return {
    args: args,
    callback: callback
  };
};

var nodeify = function (promise, callback) {
  if (callback) {
    promise = promise
      .then(function (value) {
        callback(null, value);
        return value;
      }, function (error) {
        callback(error);
      })
      .catch(function (error) {
        makeError(error);
      });
  }
  return promise;
};

var nApply = function (fn, args, ctx) {
  return new Promise(function (resolve, reject) {

    var resolver = function (error, value) {
      if (error) {
        reject(error);
      } else if (arguments.length > 2) {
        resolve(Array.prototype.slice.call(arguments, 1));
      } else {
        resolve(value);
      }
    };

    args.push(resolver);
    fn.apply(ctx, args);
  });
};

var nBind = function (fn, ctx) {
  return function () {
    var args = Array.prototype.slice.call(arguments);

    return nApply(fn, args, ctx);
  }
};

function makeError(error) {
  process.once('uncaughtException', function (err) {
    console.log(err.message);
    process.exit(1);
  });

  process.nextTick(function () {
    throw this.error;
  }.bind({error: error}));
}

// Proxy for the native cursor prototype that normalizes method names and
// arguments to fit the mongo shell.

var Cursor = function (getcursor) {
  Readable.call(this, {objectMode: true, highWaterMark: 0});
  this._get = getcursor;
};

util.inherits(Cursor, Readable);

Cursor.prototype.toArray = function () {
  return this._apply('toArray', arguments);
};

Cursor.prototype.next = function () {
  return this._apply('nextObject', arguments);
};

Cursor.prototype.forEach = function (fn) {
  if (fn.length == 1) {
    //the fn is promise type (function (doc) {...})
    return this._get()
      .then(function (cursor) {
        return new Promise(function (resolve, reject) {
          cursor.each(function (err, doc) {
            if (err) {
              reject(err);
            } else if (doc) {
              fn(doc);
            } else {
              resolve();
            }
          });
        });
      });
  } else {
    //the fn is probably the old type (function (err, doc) {...})
    this._get()
      .then(function (cursor) {
        cursor.each(fn);
      });
  }
};

Cursor.prototype.count = function () {
  return this._apply('count', arguments);
};

Cursor.prototype.explain = function () {
  return this._apply('explain', arguments);
};

Cursor.prototype.limit = function () {
  return this._config('limit', arguments);
};

Cursor.prototype.skip = function () {
  return this._config('skip', arguments);
};

Cursor.prototype.batchSize = function () {
  return this._config('batchSize', arguments);
};

Cursor.prototype.sort = function () {
  return this._config('sort', arguments);
};

Cursor.prototype.rewind = function () {
  return this._config('rewind', arguments);
};

Cursor.prototype.destroy = function () {
  var p = this._apply('close', arguments);
  this.push(null);
  return p;
};

Cursor.prototype.map = function (mapfn, callback) {
  var theneble = this.toArray()
    .then(function (arr) {
      return arr.map(mapfn);
    });

  return nodeify(theneble, callback);
};

Cursor.prototype.size = function (callback) {
  return nodeify(this.count(true), callback);
};

// If .then is called on a cursor, invoke toArray() and return promise
Cursor.prototype.then = function () {
  var promise = this.toArray()
  return promise.then.apply(promise, arguments);
};


Cursor.prototype._apply = function (fn, args) {
  // separate callback and args.
  var cargs = splitArgs(args);
  // return promise, call the callback if specified.
  return nodeify(this._get()
    .then(function (cursor) {
      return nApply(cursor[fn], cargs.args, cursor);
    }), cargs.callback);
};

Cursor.prototype._read = function () { // 0.10 stream support (0.8 compat using readable-stream)
  var self = this;
  this.next(function (err, data) {
    if (err) return self.emit('error', err);
    self.push(data);
  });
};

Cursor.prototype._config = function (fn, args) {
  var cargs = splitArgs(args),
  p = this._apply(fn, cargs.args);

  // if callback is specified, toArray() will be automatically called
  // if using promises, toArray() will have to be called manually
  if (cargs.callback) {
    return this.toArray(cargs.callback);
  } else {
    return this;
  }
};

Cursor.prototype.hint = function (index) {
  var self = this;

  return this._get()
    .then(function (cursor) {
      cursor.addQueryModifier('$hint', index);
      return self;
    });
};

// Proxy for the native collection prototype that normalizes method names and
// arguments to fit the mongo shell.

var Collection = function (name, oncollection) {
  this._get = oncollection;
  this._name = name;
};

Collection.prototype.aggregate = function () {
  return this._apply(DriverCollection.aggregate, arguments);
};

Collection.prototype.count = function () {
  return this._apply(DriverCollection.count, arguments);
};

Collection.prototype.createIndex = function () {
  return this._apply(DriverCollection.createIndex, arguments);
};

Collection.prototype.distinct = function () {
  return this._apply(DriverCollection.distinct, arguments);
};

Collection.prototype.drop = function () {
  return this._apply(DriverCollection.drop, arguments);
};

Collection.prototype.dropIndex = function () {
  return this._apply(DriverCollection.dropIndex, arguments);
};

Collection.prototype.ensureIndex = function () {
  return this._apply(DriverCollection.ensureIndex, arguments);
};

Collection.prototype.isCapped = function () {
  return this._apply(DriverCollection.isCapped, arguments);
};

Collection.prototype.mapReduce = function () {
  return this._apply(DriverCollection.mapReduce, arguments);
};

Collection.prototype.reIndex = function () {
  return this._apply(DriverCollection.reIndex, arguments);
};

Collection.prototype.stats = function () {
  return this._apply(DriverCollection.stats, arguments);
};


Collection.prototype.find = function () {
  var self = this;
  var cargs = splitArgs(arguments);

  var getcursor = thunk(function () {
    return self._get()
      .then(function (collection) {
        return nApply(collection.find, cargs.args, collection);
      });
  });

  if (cargs.callback) {
    // run toArray if callback specified
    return nodeify(getcursor()
      .then(function (cursor) {
        return nApply(cursor.toArray, [], cursor);
      }), cargs.callback);
  } else {
    // otherwise just return the cursor
    return new Cursor(getcursor);
  }
};

Collection.prototype.findOne = function () { // see http://www.mongodb.org/display/DOCS/Queries+and+Cursors
  var cargs = splitArgs(arguments);
  var promise = this.find
    .apply(this, cargs.args)
    .limit(1)
    .next();

  return nodeify(promise, cargs.callback);
};

Collection.prototype.findAndModify = function (options, callback) {
  var args = [options.query, options.sort || [], options.update || {}, {
    new: !!options.new,
    remove: !!options.remove,
    upsert: !!options.upsert,
    fields: options.fields
  }];

  if (callback) {
    args.push(function (err, doc, obj) {
      callback(err, doc, (err && err.lastErrorObject) || (obj && obj.lastErrorObject) || {n: 0});
    });
  }

  return this._apply(DriverCollection.findAndModify, args);
};

Collection.prototype.group = function (group, callback) {
  return nodeify(this._apply(DriverCollection.group, [
    group.key ? group.key : group.keyf,
    group.cond,
    group.initial,
    group.reduce,
    group.finalize,
    true
  ]), callback);
};

Collection.prototype.remove = function () {
  var self = this;
  var cargs = splitArgs(arguments);
  var args = cargs.args;
  var cb = false;

  if (cargs.callback) {
    cb = function (err, doc, errObj) {
      cargs.callback(err, doc.result, errObj);
    };
  }


  if (args.length > 1 && args[1] === true) { // the justOne parameter
    return this.findOne(args[0])
      .then(function (doc) {
        if (!doc) {
          return 0;
        }
        var args = [doc];
        if (cb) {
          args.push(cb);
        }
        return self._apply(DriverCollection.remove, args);
      })
      .then(function (result) {
        return result.result;
      });
  } else {
    if (args.length === 0) {
      args = [{}];
    }
    if (cb) {
      args.push(cb);
    }
    return this._apply(DriverCollection.remove, args)
      .then(function (result) {
        return result.result;
      });
  }
};

Collection.prototype.insert = function () {
  var cargs = splitArgs(arguments);
  return nodeify(this
    ._apply(DriverCollection.insert, cargs.args)
      .then(function (result) {
        if (Array.isArray(cargs.args[0])) {
          return result.ops;
        } else {
          return result.ops[0];
        }
      }), cargs.callback);
};

Collection.prototype.save = function () {
  var cargs = splitArgs(arguments);

  if (cargs.callback) {
    cargs.args.push(function (err, doc, lastErrorObject) {
      if (err) return cargs.callback(err);
      if (!doc.ops) {
        cargs.callback(err, cargs.args[0], lastErrorObject);
      } else {
        cargs.callback(err, doc.ops[0], {n: 0});
      }
    });
  }
  return this._apply(DriverCollection.save, cargs.args)
    .then(function (result) {
      if (!result.ops) {
        return cargs.args[0];
      } else {
        return result.ops[0];
      }
    });
};

Collection.prototype.update = function () {
  var cargs = splitArgs(arguments);

  if (cargs.args.length < 3) {
    cargs.args.push({w: 1});
  }

  return nodeify(this._apply(DriverCollection.update, cargs.args)
    .then(function (result) {
      return result.result;
    }), cargs.callback);
};

Collection.prototype.getIndexes = function () {
  return this._apply(DriverCollection.indexes, arguments);
};

Collection.prototype.runCommand = function (cmd, opts, callback) {
  opts = opts || {};
  if (typeof opts === 'function') {
    callback = opts;
  }
  return this._get().then(function (collection) {
    var commandObject = {};
    commandObject[cmd] = collection.collectionName;

    Object.keys(opts).forEach(function (key) {
      commandObject[key] = opts[key];
    });
    return nodeify(nApply(collection.s.db.command, [commandObject], collection.s.db), callback);
  });
};

Collection.prototype.toString = function () {
  return this._name;
};

forEachMethod(DriverCollection, Collection.prototype, function (methodName, fn) {
  Collection.prototype[methodName] = function () { // we just proxy the rest of the methods directly
    return this._apply(fn, arguments);
  };
});

Collection.prototype._apply = function (fn, args) {
  var cargs = splitArgs(args);

  return this._get().then(function (collection) {
    var safe = collection.opts && collection.opts.safe;
    !collection.opts ? (collection.opts = {safe: true}) : (collection.opts.safe = true);

    if (collection.opts && cargs.callback) {
      fn.apply(collection, args);
      collection.opts.safe = safe;
    } else {
      return nApply(fn, cargs.args, collection)
        .then(function (res) {
          collection.opts.safe = safe;
          return res;
        });
    }
  });
};

// EXTENDED FUNCTIONS
// make lastErrorObject available to promise-returning functions.
// The 'Ex' variety of the function returns a promise which resolves
//   an object like { result: ... , lastErrorObject: ... }.

Collection._makeExtendedFn = function (fn) {
  return function () {
    var args = Array.prototype.slice.call(arguments);
    var self = this;

    var promise = new Promise(function (resolve, reject) {
      // add callback function
      args.push(function (err, doc, obj) {
        if (err) {
          reject(err);
        } else {
          resolve({result: doc, lastErrorObject: obj});
        }
      });
      fn.apply(self, args);
    });

    return promise;
  };
};

Collection.prototype.findAndModifyEx = Collection._makeExtendedFn(Collection.prototype.findAndModify);


var toConnectionString = function (conf) { // backwards compat config map (use a connection string instead)
  var options = [];
  var hosts = conf.replSet ? conf.replSet.members || conf.replSet : [conf];
  var auth = conf.username ? (conf.username + ':' + conf.password + '@') : '';

  hosts = hosts.map(function (server) {
    if (typeof server === 'string') return server;
    return (server.host || '127.0.0.1') + ':' + (server.port || 27017);
  }).join(',');

  if (conf.slaveOk) options.push('slaveOk=true');

  return 'mongodb://' + auth + hosts + '/' + conf.db + '?' + options.join('&');
};

var parseConfig = function (cs) {
  if (typeof cs === 'object' && cs) return toConnectionString(cs);
  if (typeof cs !== 'string') throw new Error('connection string required'); // to avoid undef errors on bad conf
  cs = cs.replace(/^\//, '');

  if (cs.indexOf('/') < 0) return parseConfig('127.0.0.1/' + cs);
  if (cs.indexOf('mongodb://') !== 0) return parseConfig('mongodb://' + cs);

  return cs;
};

var Database = function (name, getdb) {
  EventEmitter.call(this);
  this._get = getdb;
  this._name = name;
};

util.inherits(Database, EventEmitter);

Database.prototype.runCommand = function (opts, callback) {
  if (typeof opts === 'string') {
    var tmp = opts;
    opts = {};
    opts[tmp] = 1;
  }
  return nodeify(this._get()
    .then(function (db) {
      var dbcommand = nBind(db.command, db);
      if (opts.shutdown === undefined) {
        return dbcommand(opts);
      }
      // If the command in question is a shutdown, mongojs should shut down the server without crashing.
      return dbcommand(opts).then(function (res) {
        db.close();
        return result;
      });
    }), callback);
};

Database.prototype.open = function (callback) {
  return nodeify(this._get(), callback); // a way to force open the db, 99.9% of the times this is not needed
};

Database.prototype.getCollectionNames = function (callback) {
  return nodeify(this.collections()
    .then(function (cols) {
      return cols.map(function (c) {
        return c.collectionName;
      });
    }), callback);
};

Database.prototype.createCollection = function (name, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  opts = opts || {};
  opts.strict = opts.strict !== false;
  return nodeify(this._apply(DriverDb.createCollection, [name, opts]), callback);
};

Database.prototype.collection = function (name, options) {
  var self = this;

  var getcollection = thunk(function () {
    return self._get().then(function (db) {
      return nApply(db.collection, [name, options], db);
    });
  });

  return new Collection(this._name + '.' + name, getcollection);
};

Database.prototype.getSiblingDb = function (connectionString, collections) {
  var newConnectionString;
  //[match, host, options]
  var currentConnection = this.connectionString.match(/^mongodb:\/\/([^\/]+)\/[^?]+(\?.*)?/);
  //[match, mongodb://, host or db, maybe db]
  var newConnection = connectionString.match(/^(mongodb:\/\/)?([^\/]+)(\/[^?]+)?/);
  //if newConnection has the host set then it'll override the current connection
  if (newConnection[3] !== undefined) {
    newConnectionString = connectionString;
  } else {
    newConnectionString = 'mongodb://' + currentConnection[1] + '/' + newConnection[2];
  }
  return module.exports(newConnectionString, collections);
};

Database.prototype.toString = function () {
  return this._name;
};

Database.prototype.getLastError = function (callback) {
  return nodeify(this.runCommand('getLastError')
    .then(function (result) {
      return result.err;
    }), callback);
};

Database.prototype.getLastErrorObj = function (callback) {
  return nodeify(this.runCommand('getLastError'), callback);
};

Database.prototype._apply = function (fn, args) {
  var cargs = splitArgs(args);

  return nodeify(this._get()
    .then(function (db) {
      return nApply(fn, cargs.args, db);
    }), cargs.callback);
};

Database.prototype.db = function (dbName, callback) {
  return nodeify(this._get()
    .then(function (db) {
      var getdb = thunk(function () {
        var func = function () {
          db = db.db(dbName);
          that.client = db;
          that.emit('ready');
          db.on('error', function (err) {
            process.nextTick(function () {
              that.emit('error', err);
            });
          });
          return db;
        };

        return new Promise(function (resolve, reject) {
          var result;
          try {
            result = func();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });

      var that = new Database(dbName, getdb);
      that.bson = mongodb.BSONPure;
      that.ObjectId = mongodb.ObjectID;

      return that;
    }), callback);
};

forEachMethod(DriverDb, Database.prototype, function (methodName, fn) {
  Database.prototype[methodName] = function () {
    return this._apply(fn, arguments);
  };
});

var connect = function (config, collections) {
  var connectionString = parseConfig(config);
  var dbName = (connectionString.match(/\/([^\/\?]+)(\?|$)/) || [])[1] || 'db';

  var getdb = thunk(function () {
    return nApply(mongodb.MongoClient.connect, [connectionString], mongodb.MongoClient)
      .then(function (db) {
        that.client = db;
        that.emit('ready');
        db.on('error', function (err) {
          process.nextTick(function () {
            that.emit('error', err);
          });
        });
        return db;
      }, function () {
        makeError(new Error('No connection to Database!'));
      });
  });

  var that = new Database(dbName, getdb);
  that.connectionString = connectionString;
  that.bson = mongodb.BSONPure; // backwards compat (require('bson') instead)
  that.ObjectId = mongodb.ObjectID; // backwards compat

  collections = collections || config.collections || [];
  collections.forEach(function (colName) {
    var parts = colName.split('.');
    var last = parts.pop();
    var parent = parts.reduce(function (parent, prefix) {
      return parent[prefix] = parent[prefix] || {};
    }, that);

    parent[last] = that.collection(colName);
  });

  return that;
};

connect.connect = connect; // backwards compat

// expose bson stuff visible in the shell
connect.ObjectId = mongodb.ObjectID;
connect.DBRef = mongodb.DBRef;
connect.Timestamp = mongodb.Timestamp;
connect.MinKey = mongodb.MinKey;
connect.MaxKey = mongodb.MaxKey;
connect.NumberLong = mongodb.Long;

connect.Cursor = Cursor;
connect.Collection = Collection;
connect.Database = Database;

module.exports = connect;

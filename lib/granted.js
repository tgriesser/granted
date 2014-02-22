module.exports = function() {
  var _           = require('lodash');
  var Promise     = require('bluebird');
  var createError = require('create-error');

  // The top level "granted" function, which acts as a namespace
  // as well as a little helper which mixes the "granted" capabilities
  // into objects that don't have them yet.
  var granted = function(obj) {
    if (!obj) return;
    if (typeof obj === "function") {
      return _.extend(obj.prototype, granted.mixin);
    }
    return _.extend(obj, mixin);
  };

  // Create a few "custom" error types for the library.
  // The "NotGranted" is the default, sub-classed
  // into "NotDefined" or "Denied".
  var NotGranted = createError('NotGranted');
  var NotDefined = createError(NotGranted, 'NotDefined');
  var Denied     = createError(NotGranted, 'Denied');
  var Invalid    = createError(NotGranted, 'Invalid');

  granted.Errors = {
    NotDefined: NotDefined,
    NotGranted: NotGranted,
    Denied:     Denied,
    Invalid:    Invalid
  };

  // Internal flag for the `ungrant` / `undeny` methods.
  var isDenying = false;

  // The "mixin" for the object prototype.
  var mixin = granted.mixin = {

    __granted: null,

    // Grant one or more permissions on the current object, optionally checking
    // against a Target constructor.
    grants: function(Target, name, predicate) {
      var names;
      if (_.isFunction(Target)) {
        names = _.isArray(name) ? name : [name];
      } else {
        names = _.isArray(Target) ? Target : [Target];
      }
      this.__granted = this.__granted || {};
      for (var i = 0, l = names.length; i < l; i++) {
        var permissions = this.__granted[names[i]] || (this.__granted[names[i]] = []);
        if (_.isFunction(Target)) {
          permissions.push({predicate: predicate, ctx: this, deny: isDenying, ctor: Target});
        } else {
          permissions.push({predicate: name, ctx: this, deny: isDenying});
        }
      }
      return this;
    },

    // Basically `grants`, except not.
    denies: function() {
      isDenying = true;
      this.grants.apply(this, arguments);
      isDenying = false;
      return this;
    },

    // Check whether the current object `can` do something else.
    can: Promise.method(function(permission, target, options, cb) {
      var args, deniers, acceptors;
      if (!target.hasOwnProperty('__granted')) {
        throw new Invalid('Not a "Granted" Object');
      }
      if (!target.__granted || !target.__granted[permission]) {
        throw new NotDefined(permission);
      }
      deniers = []; acceptors = [];
      var permissions = target.__granted[permission];
      for (var i = 0, l = permissions.length; i < l; i++) {
        var current = permissions[i];
        if (!current.ctor || (this instanceof current.ctor)) {
          if (current.deny) {
            deniers.push(current);
          } else {
            acceptors.push(current);
          }
        }
      }
      // If we have nothing to go on, throw an error.
      if (deniers.length === 0 && acceptors.length === 0) {
        throw new NotDefined(permission);
      }
      args = _.isPlainObject(options) ? [this, options] : [this, {}];
      return runPromise(deniers.concat(acceptors), args, (_.isFunction(options) ? options : cb));
    }),

    // Remove one or more granted permissions based on
    // the arguments provided.
    ungrant: function(Target, name, predicate) {
      if (_.isFunction(Target)) {
        ungrantCtor.apply(this, arguments);
      } else {
        ungrantName.apply(this, arguments);
      }
      return this;
    },

    // Un-deny a previously denied handler or permission.
    undeny: function() {
      isDenying = true;
      this.ungrant.apply(this, arguments);
      isDenying = false;
      return this;
    }
  };

  // Loop through the permissions and call the specified "handler"
  // function. If this returns true, keep the permission,
  // otherwise ditch it.
  function loopPermissions(keys, obj, handler) {
    for (var i = 0, l = keys.length; i < l; i++) {
      var key = keys[i];
      var permissions = obj.__granted[key];
      var kept = obj.__granted[key] = [];
      for (var i2 = 0, l2 = permissions.length; i2 < l2; i2++) {
        if (handler(permissions[i2])) {
          kept.push(permissions[i2]);
        }
      }
    }
  }

  // Ungrant the permissions, when there's a constructor specified.
  function ungrantCtor(Target, name, predicate) {
    var names = name ? (_.isArray(name) ? name : [name]) : _.keys(this.__granted);
    loopPermissions(names, this, function(p) {
      if (p.deny !== isDenying) return true;
      return (Target !== p.ctor) || (predicate && predicate !== p.predicate);
    });
  }

  // Ungrant permissions, when there's only a name and/or handler defined.
  function ungrantName(name, predicate) {
    if (arguments.length === 0) {
      return loopPermissions(_.keys(this.__granted), this, function(p) {
        return p.deny !== isDenying;
      });
    }
    var names = name ? (_.isArray(name) ? name : [name]) : _.keys(this.__granted);
    loopPermissions(names, this, function(p) {
      if (p.deny !== isDenying) return true;
      return (predicate && predicate !== p.predicate);
    });
  }

  function runPromise(targets, args, cb) {
    return Promise
      .bind({hasFailed: false, hasPassed: false})
      .thenReturn(targets)
      .map(function(current) {
        var chain = this;
        if (this.hasFailed || this.hasPassed) return;
        return Promise.try(function() {

          // Allows something like obj.grant(['edit', 'view'], User, true);
          // or obj.deny(['write'], true);
          if (_.isFunction(current.predicate)) {
            return current.predicate.apply(current.ctx, args);
          } else {
            return current.predicate;
          }
        }).then(function(result) {

          // An explicitly "true" result means the expression
          // can be evaluated. Otherwise we don't know what it means.
          if (result === true) {
            if (current.deny) {
              chain.hasFailed = 'Granted:Denied';
            } else {
              chain.hasPassed = true;
            }
          }
        }).catch(function(e) {
          if (current.deny) chain.hasFailed = e;
        });
    }).then(function() {
      if (this.hasFailed) {
        throw new Denied(this.hasFailed);
      }
      if (!this.hasPassed) {
        throw new NotGranted();
      }
    })
    .bind().thenReturn(args[0]).nodeify(cb);
  }

  return granted;
};
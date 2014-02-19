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
    grant: function(name, Target, handler) {
      var names = _.isArray(name) ? name : [name];
      this.__granted = this.__granted || {};
      for (var i = 0, l = names.length; i < l; i++) {
        var permissions = this.__granted[names[i]] || (this.__granted[names[i]] = []);
        if (arguments.length === 3) {
          permissions.push({handler: handler, ctx: this, deny: isDenying, ctor: Target});
        } else {
          permissions.push({handler: Target, ctx: this, deny: isDenying});
        }
      }
      return this;
    },

    // Basically `grant`, except not.
    deny: function() {
      isDenying = true;
      this.grant.apply(this, arguments);
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

    // Remove one or more granted permissions.
    // If the arguments.length === 1, it ungrants based on the name
    // If the arguments.length === 2, tries to first ungrant
    // based on the ctor, then the handler. Otherwise it tries all three.
    ungrant: function(name, Target, handler) {
      var keys;
      if (!this.__granted) return this;
      if (!name && !Target && !handler) {
        return loopPermissions(_.keys(this.__granted), this, removeAll);
      }
      function ungrantHandler(p) {
        if (p.deny !== isDenying) return true;
        if (len === 1) return false;
        if (len === 2) return (Target && Target !== p.handler && Target !== p.ctor);
        return ((Target && Target !== p.ctor) || (handler && handler !== p.handler));
      }
      var names = name ? (_.isArray(name) ? name : [name]) : _.keys(this.__granted);
      var len = arguments.length;
      return loopPermissions(names, this, ungrantHandler);
    },

    // Un-deny a previously denied handler or permission.
    undeny: function() {
      isDenying = true;
      this.ungrant.apply(this, arguments);
      isDenying = false;
      return this;
    }
  };

  // Loop through the permissions and deal with the handler.
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
    return obj;
  }

  // Remove all of the permissions, as long as they match up with
  // the denying.
  function removeAll(p) {
    return p.deny !== isDenying;
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
          if (_.isFunction(current.handler)) {
            return current.handler.apply(current.ctx, args);
          } else {
            return current.handler;
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
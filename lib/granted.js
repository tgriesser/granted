module.exports = function() {
  var _           = require('lodash');
  var Promise     = require('bluebird');
  var createError = require('create-error');

  // The top level "granted" function, which acts as a namespace
  // as well as a little helper which mixes the "granted" capabilities
  // into objects that don't have them yet.
  var granted = function(obj) {
    if (!obj) return;
    if (!obj.prototype && obj.grant !== mixin.grant) {
      _.extend(obj, mixin);
    } else if (obj.prototype) {
      _.extend(obj.prototype, granted.mixin);
    }
    return obj;
  };

  var NotGranted = createError('Granted:NotGranted');
  var NotDefined = createError(NotGranted, 'Granted:NotDefined');
  var Denied     = createError(NotGranted, 'Granted:Denied');

  var Errors  = granted.Errors = {
    NotDefined: NotDefined,
    NotGranted: NotGranted,
    Denied:     Denied
  };

  // Internal flag for the `ungrant` / `undeny` methods.
  var isDenying = false;

  // The "mixin" for the object prototype.
  var mixin = granted.mixin = {

    // Grant one or more permissions on the current object, optionally checking
    // against a Target constructor.
    grant: function(name, Target, handler) {
      var names = _.isArray(name) ? name : [name];
      this._permissions = this._permissions || {};
      for (var i = 0, l = names.length; i < l; i++) {
        var permissions = this._permissions[names[i]] || (this._permissions[names[i]] = []);
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
    can: Promise.method(function(permission, target, options) {
      if (!target._permissions || !target._permissions[permission]) {
        throw new NotDefined(permission);
      }
      var deniers = [], acceptors = [];
      var permissions = target._permissions[permission];
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
      return runPromise(deniers.concat(acceptors), [this, options]);
    }),

    // Remove one or more granted permissions.
    // If the arguments.length === 1, it ungrants based on the name
    // If the arguments.length === 2, tries to first ungrant
    // based on the ctor, then the handler. Otherwise it tries all three.
    ungrant: function(name, Target, handler) {
      if (!this._permissions) return this;
      if (arguments.length === 3) {
        // TODO
      } else if (arguments.length === 1) {
        // TODO
      }
    },

    // Un-deny a previously denied handler or permission.
    undeny: function() {
      isDenying = true;
      this.ungrant.apply(this, arguments);
      isDenying = false;
      return this;
    }

  };

  function runPromise(targets, args) {
    return Promise
      .bind({hasFailed: false, hasPassed: false})
      .thenReturn(targets)
      .map(function(current) {
        var chain = this;
        if (this.hasFailed || this.hasPassed) return;
        return Promise.try(function() {
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
    });
  }

  return granted;
};
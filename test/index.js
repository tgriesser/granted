require("mocha-as-promised")();

var granted = require('../index');
var chai = require("chai");
var expect = chai.expect;
var thrower = new Error('This should not be thrown');

describe('granted', function() {

  describe('function', function() {

    it('takes an object and mixes in the granted.mixin', function() {
      var obj = {};
      granted(obj);
      expect(obj.can).to.equal(granted.mixin.can);
    });

    it('takes a constructor and mixes in the granted.mixin to the prototype', function() {
      var User = function() {};
      granted(User);
      expect(User.prototype.can).to.equal(granted.mixin.can);
    });

    it('takes an instance and mixes in the granted.mixin to the prototype', function() {
      var User = function() {};
      var user = new User();
      granted(user);
      expect(user.can).to.equal(granted.mixin.can);
    });

    it('has no issues if no object is passed', function() {
      granted();
    });

    it('can be called with new without side-effects', function() {
      var obj = {};
      new granted(obj);
      expect(obj.can).to.equal(granted.mixin.can);
    });

  });

  describe('grant', function() {
    var User, obj;

    beforeEach(function() {
      User = function() { this.name = 'tester'; };
      obj  = granted({});
    });

    it('takes a permission and a callback', function() {
      function fn(user) { return user.name === 'tester'; }
      obj.grant('accessible', fn);
      expect(obj._permissions.accessible[0]).to.eql({handler: fn, ctx: obj, deny: false});
    });

    it('takes a permission, constructor, and callback', function() {
      function fn(user) { return user.name === 'tester'; }
      obj.grant('accessible', User, fn);
      expect(obj._permissions.accessible[0]).to.eql({handler: fn, ctor: User, ctx: obj, deny: false});
    });
  });

  describe('can', function() {
    var User, Admin, user, admin, obj, obj2;

    beforeEach(function() {
      User = function() { this.name = 'tester'; };
      Admin = function() { this.name = 'tester'; };
      obj  = granted({name: 'tester'});
      obj2 = granted({name: 'notTester'});
      user = new User();
      admin = new Admin();
      granted(User);
      granted(Admin);
    });

    it('checks whether an object can do something', function() {
      obj.grant('access', function(user) {
        return this.name === user.name;
      });
      return user.can('access', obj).then(function() {
        return obj2.can('access', obj).thenThrow(thrower).catch(function(e) {
          expect(e).to.be.an.instanceOf(granted.Errors.NotGranted);
        });
      });
    });

    it('checks whether an object can do something, based on a Constructor', function() {
      obj.grant('access', Admin, function() {
        return this.name === 'tester';
      });
      return user.can('access', obj).thenThrow(thrower).catch(function(e) {
        expect(e).to.be.an.instanceOf(granted.Errors.NotDefined);
        return admin.can('access', obj);
      });
    });

    it('will be rejected with any denials', function() {
      obj.grant('access', User, true);
      obj.deny('access', User, function(user) {
        return user.id === 1;
      });
      return user.can('access', obj).then(function() {
        user.id = 1;
        return user.can('access', obj);
      }).thenThrow(thrower).catch(function() {});
    });

  });

});
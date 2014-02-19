require("mocha-as-promised")();

var _ = require('lodash');
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
      expect(obj.__granted.accessible[0]).to.eql({handler: fn, ctx: obj, deny: false});
    });

    it('takes a permission, constructor, and callback', function() {
      function fn(user) { return user.name === 'tester'; }
      obj.grant('accessible', User, fn);
      expect(obj.__granted.accessible[0]).to.eql({handler: fn, ctor: User, ctx: obj, deny: false});
    });

    it('grants multiple permissions with an array', function() {
      obj.grant(['post', 'put', 'del'], function() {});
      expect(_.keys(obj.__granted)).to.have.length(3);
    });

  });

  describe('ungrant / undeny', function() {
    var User, obj;

    beforeEach(function() {
      User = function() { this.name = 'tester'; };
      obj  = granted({});
    });

    it('allows ungranting all by a name', function() {
      obj.grant('access', function() {});
      obj.grant('access', User, function() {});
      obj.grant('item', User, function() {});
      obj.ungrant();

      expect(obj.__granted.access).to.eql([]);
    });

    it('allows ungranting all by a Constructor', function() {
      obj.grant('access', function() {});
      obj.grant('access', User, function() {});
      obj.grant('item', User, function() {});

      obj.ungrant(null, User, null);
      expect(obj.__granted.item.length).to.equal(0);
      expect(obj.__granted.access.length).to.equal(1);
    });

    it('allows ungranting all by the function', function() {
      var x = function() {};
      obj.grant('access', x);
      obj.grant('access', User, function() {});
      obj.grant('item', User, x);

      expect(obj.__granted.item.length).to.equal(1);
      expect(obj.__granted.access.length).to.equal(2);
      obj.ungrant(null, x);
      expect(obj.__granted.item.length).to.equal(0);
      expect(obj.__granted.access.length).to.equal(1);
    });

    it('allows ungranting by the function/Ctor combo', function() {
      var x = function() {};
      obj.grant('access', x);
      obj.grant('access', User, x);
      obj.grant('item', x);

      expect(obj.__granted.item.length).to.equal(1);
      expect(obj.__granted.access.length).to.equal(2);
      obj.ungrant(null, User, x);
      expect(obj.__granted.item.length).to.equal(1);
      expect(obj.__granted.access.length).to.equal(1);
    });

    it('allows ungranting by the name/function/Ctor combo', function() {
      var x = function() {};
      obj.grant('access', x);
      obj.grant('access', User, x);
      obj.grant('item', x);

      expect(obj.__granted.item.length).to.equal(1);
      expect(obj.__granted.access.length).to.equal(2);
      obj.ungrant('item', User, x);
      expect(obj.__granted.item.length).to.equal(1);
      expect(obj.__granted.access.length).to.equal(2);
      obj.ungrant('access', User, x);
      expect(obj.__granted.item.length).to.equal(1);
      expect(obj.__granted.access.length).to.equal(1);
    });

    it('only ungrants granted things, and only undenys denied things', function() {
      obj.grant('one', function() {});
      obj.deny('one', function() {});
      obj.grant('one', User, function() {});
      obj.deny('one', User, function() {});
      obj.undeny(null, User);
      expect(obj.__granted.one.length).to.equal(3);
      obj.undeny('one');
      expect(obj.__granted.one.length).to.equal(2);
      obj.deny('one', function() {});
      obj.ungrant('one');
      expect(obj.__granted.one.length).to.equal(1);
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

    it('throws an invalid error when checking a non-granted object', function() {
      return obj.can('access', {}).catch(function(e) {
        expect(e).to.be.an.instanceOf(granted.Errors.Invalid);
      });
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

    it('has both a promise and callback api', function() {
      obj.grant('access', User, true);
      obj.deny('access', User, function(user) {
        return user.id === 1;
      });
      return user.can('access', obj, function(err, resp) {
        expect(err).to.equal(null);
        expect(resp).to.equal(user);
      }).then(function() {
        user.id = 1;
        return user.can('access', obj, function(err, resp) {
          expect(err).to.be.an.instanceOf(granted.Errors.Denied);
        }).catch(function() {});
      });
    });

  });

});
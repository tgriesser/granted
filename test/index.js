var _       = require('lodash');
var granted = require('../index');
var chai    = require("chai");
var expect  = chai.expect;
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

  describe('grants', function() {
    var User, obj;

    beforeEach(function() {
      User = function() { this.name = 'tester'; };
      obj  = granted({});
    });

    it('takes a permission and a predicate', function() {
      function fn(user) { return user.name === 'tester'; }
      obj.grants('accessible', fn);
      expect(obj.__granted.accessible[0]).to.eql({predicate: fn, ctx: obj, deny: false});
    });

    it('takes a permission, constructor, and predicate', function() {
      function fn(user) { return user.name === 'tester'; }
      obj.grants(User, 'accessible', fn);
      expect(obj.__granted.accessible[0]).to.eql({predicate: fn, first: User, ctx: obj, deny: false});
    });

    it('grants multiple permissions with an array', function() {
      obj.grants(['post', 'put', 'del'], function() {});
      expect(_.keys(obj.__granted)).to.have.length(3);
    });

    it('allows a simple predicate as the first argument', function() {
      var file = granted({});
      var obj  = granted({tableName: 'user'});
      var obj2 = granted({tableName: 'acocunt'});
      var matcher = function(obj) { return obj.tableName === 'user'; };
      file.grants(matcher, 'write', function(matcher) {
        return true;
      });
      return obj.can('write', file).then(function() {
        return obj2.can('write', file);
      }).catch(function(e) {
        expect(e.message).to.equal('Granted not matched: write');
      });
    });

  });

  describe('ungrant / undeny', function() {
    var User, obj;

    beforeEach(function() {
      User = function() { this.name = 'tester'; };
      obj  = granted({});
    });

    it('allows ungranting all by a name', function() {
      obj.grants('access', function() {});
      obj.grants(User, 'access', function() {});
      obj.grants(User, 'item', function() {});
      obj.ungrant();

      expect(obj.__granted.access).to.eql([]);
    });

    it('allows ungranting all by a Constructor', function() {
      obj.grants('access', function() {});
      obj.grants(User, 'access', function() {});
      obj.grants(User, 'item', function() {});

      obj.ungrant(User, null, null);
      expect(obj.__granted.item.length).to.equal(0);
      expect(obj.__granted.access.length).to.equal(1);
    });

    it('allows ungranting all by the function', function() {
      var x = function() {};
      obj.grants('access', x);
      obj.grants(User, 'access', function() {});
      obj.grants(User, 'item', x);

      expect(obj.__granted.item.length).to.equal(1);
      expect(obj.__granted.access.length).to.equal(2);
      obj.ungrant(null, x);
      expect(obj.__granted.item.length).to.equal(0);
      expect(obj.__granted.access.length).to.equal(1);
    });

    it('allows ungranting by the function/Ctor combo', function() {
      var x = function() {};
      obj.grants('access', x);
      obj.grants(User, 'access', x);
      obj.grants('item', x);

      expect(obj.__granted.item.length).to.equal(1);
      expect(obj.__granted.access.length).to.equal(2);
      obj.ungrant(User, null, x);
      expect(obj.__granted.item.length).to.equal(1);
      expect(obj.__granted.access.length).to.equal(1);
    });

    it('allows ungranting by the name/function/Ctor combo', function() {
      var x = function() {};
      obj.grants('access', x);
      obj.grants('access', User, x);
      obj.grants('item', x);

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
      obj.grants('one', function() {});
      obj.denies('one', function() {});
      obj.grants(User, 'one', function() {});
      obj.denies(User, 'one', function() {});
      obj.undeny(User, null);
      expect(obj.__granted.one.length).to.equal(3);
      obj.undeny('one');
      expect(obj.__granted.one.length).to.equal(2);
      obj.denies('one', function() {});
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
      obj.grants('access', function(user) {
        return this.name === user.name;
      });
      return user.can('access', obj).then(function() {
        return obj2.can('access', obj).thenThrow(thrower).catch(function(e) {
          expect(e).to.be.an.instanceOf(granted.Errors.NotGranted);
        });
      });
    });

    it('checks whether an object can do something, based on a Constructor', function() {
      obj.grants(Admin, 'access', function() {
        return this.name === 'tester';
      });
      return user.can('access', obj).thenThrow(thrower).catch(function(e) {
        expect(e).to.be.an.instanceOf(granted.Errors.NotDefined);
        return admin.can('access', obj);
      });
    });

    it('will be rejected with any denials', function() {
      obj.grants(User, 'access', true);
      obj.denies(User, 'access', function(user) {
        return user.id === 1;
      });
      return user.can('access', obj).then(function() {
        user.id = 1;
        return user.can('access', obj);
      }).thenThrow(thrower).catch(function() {});
    });

    it('has both a promise and node callback api', function() {
      obj.grants(User, 'access', true);
      obj.denies(User, 'access', function(user) {
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
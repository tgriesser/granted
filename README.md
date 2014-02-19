# Granted

An object agnostic authorization layer for javascript. Features both a
promise (recommended) and callback api for checking permissions.

```js
account.grant('admin', User, function(user) {
  return (user.role === 'admin' || this.owner_id === user.id)
});

user.can('admin', account).then(function(user) {
  // .. the user is allowed to admin
}).catch(function(e) {
  // .. the user is not allowed to admin
});
```

## Introduction:

Sometimes granting access between different objects gets hairy. You have edge cases
and lots of ways that permissions can work and things end up being quite a mess.

Granted looks to simplify all of that, taking inspiration from projects like [can can](https://github.com/ryanb/cancan)
in ruby, it defines a few simple methods on an object, allowing us to reliably determine whether
one object can perform an action on another.

Let's look at a simple example, say we have three objects, `SuperUser`, `User` and `Document`.

We want a document to be managed by any `SuperUser`, but only to a `User` if they have
a "role" of "admin", or if they own the account. How would we do that?

First, we would define the granted permissions on the `Account`:

```js
var doc = new Document({owner_id: 2, title: 'My Secret Account'});

// Allow any "authenticated" user to read the document.
doc.grant('read', User, function(user) {
  return user.isAuthenticated();
});

// Allow SuperUsers to do anything to the document.
doc.grant(['read', 'write', 'destroy'], SuperUser, true);

// Allow Users to do anything to the document if they're
doc.grant(['read', 'write', 'destroy'], User, function(user) {

  // Check that the user's ID matches with the owner_id of the document
  return user.id === this.get('owner_id')
});

// Allow anyone to read the metadata about an document, unless the
// object contains an is_robot flag.
doc.grant('readMeta', function(obj) {
  return obj.is_robot !== true;
});
```

Now, we can elsewhere call the `can` method on the object we're checking
permissions on:

```js
// Assumes `granted` has been mixed-in to each constructor
var su      = new SuperUser();
var authed  = new User({authenticated: true});
var user    = new User({id: 2});
var visitor = new Generic();
var robot   = new Generic({is_robot: true});

su.can('write', doc).then(function(su) {
  // ..
})

su.can('destroy', doc).then(function() {
  // ..
})

authed.can('read').then(function() {
  // true, because the user has been authed.
})

visitor.can('write', doc).catch(function(e) {
  // e instanceof granted.Errors.NotGranted
})

// or:

visitor.can('write', doc, function(e, visitor) {
  // e instanceof granted.Errors.NotGranted
});

```

## API:
- .can(name, [options]).then(...).catch(...)
- .can(name, [options], callback)

- .grant(name, [Target], handler)
- .deny(name, [Target], handler)
- .ungrant([name], [Target], [handler])
- .undeny([name], [Target], [handler])


## Basic Use:

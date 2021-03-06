// Copyright (c) 2017 The Regents of the University of Michigan.
// All Rights Reserved. Licensed according to the terms of the Revised
// BSD License. See LICENSE.txt for details.

const TreeError = function(description, messages, children) {
  let error = new Error();
  error.description = description;
  error.messages = messages;
  error.children = children;

  return error;
};

let processTree = (newLogger, setUp) => {
  return new Promise(function(resolve, reject) {
    treeNode([], setUp).then(function(runnableNode) {
      let logger = newLogger(runnableNode.getLogTree());

      logger.storeProcess(runnableNode.run(logger));

      resolve(logger);
    }, reject);
  });
};

let treeNode = (address, setUp) => {
  return new Promise(function(resolve, reject) {
    let payload = {};
    let internal = {
      "address": address,
      "resolve": resolve,
      "reject": reject,
      "setUp": setUp
    };

    initInternal(internal, payload);
    initPayload(internal, payload);
    createRunMethod(internal, payload);
    attemptSetUp(internal, payload);
  });
};

let initInternal = function(internal, payload) {
  internal.runnableNode = {};
  internal.errors = [];
  internal.children = [];

  internal.appendChild = function(childSetUpFunction) {
    internal.children.push(treeNode(internal.generateNewChildAddress(),
                                    childSetUpFunction));
  };

  internal.generateNewChildAddress = function() {
    return internal.address.concat(internal.children.length);
  };

  internal.definePayloadLogFunction = function(logger) {
    payload.log = function(code, message) {
      return logger.log(internal.buildMessageObject(code, message));
    };
  };

  internal.buildMessageObject = function(code, message) {
    let fullMessage = [Date.now(), code].concat(internal.address);

    fullMessage.push(message || "");

    return fullMessage;
  };
};

let initPayload = function(internal, payload) {
  payload.runBefore = () => {};
  payload.run = () => {};
  payload.runAfter = () => {};

  payload.log = () => {};
  payload.add = internal.appendChild;
};

let createRunMethod = function(internal, payload) {
  internal.runnableNode.run = logger => {
    return new Promise(function(resolve, reject) {
      internal.definePayloadLogFunction(logger);
      payload.log("begin");

      let errors = [];
      let runningChildren = [];

      let errorOutWithMessage = function(message) {
        errors.push(message);
        errorOutWithChildren([]);
      };

      let errorOutWithChildren = function(children) {
        reject(TreeError(payload.description, errors, children));
      };

      runAndWait(payload.runBefore).then(function() {
        runAndWait(payload.run).then(function() {
          for (let child of internal.runnableNode.children)
            runningChildren.push(child.run(logger));

          awaitOrCollectAllErrors(runningChildren).then(function() {
            runAndWait(payload.runAfter).then(function() {
              payload.log("done");
              resolve();
            }, errorOutWithMessage);
          }, errorOutWithChildren);
        }, errorOutWithMessage);
      }, errorOutWithMessage);
    });
  };
};

let attemptSetUp = function(internal, payload) {
  let errorOut = function(children) {
    internal.reject(TreeError(payload.description,
                              internal.errors,
                              children));
  };

  runAndWait(function() {
    return internal.setUp(payload);
  }).then(function() {
    return awaitOrCollectAllErrors(internal.children);
  }, function(error) {
    internal.errors.push(error);
    return awaitOrCollectAllErrors(internal.children);
  }).then(function(childIterator) {
    if (internal.errors.length > 0) {
      errorOut([]);
    } else {
      internal.runnableNode.children = [...childIterator];
      resolveWithRunnableNode(internal, payload);
    }
  }, errorOut);
};

let resolveWithRunnableNode = function(internal, payload) {
  internal.runnableNode.getLogTree = function() {
    let result = {};

    if (payload.description)
      result.d = payload.description;

    result.c = [];
    for (let leaf of internal.runnableNode.children)
      result.c.push(leaf.getLogTree());

    return result;
  };

  internal.resolve(internal.runnableNode);
};

let awaitOrCollectAllErrors = promises => {
  return new Promise(function(resolve, reject) {
    Promise.all(promises).then(function(value) {
      resolve(value);
    }, function() {
      Promise.all(getListOfErrorPromises(promises)).then(
        rejectWithOrderedListOfErrors(reject));
    });
  });
};

let getListOfErrorPromises = function(promises) {
  let errorPromises = [];

  for (let promise of promises)
    errorPromises.push(new Promise(function(resolve) {
      promise.then(function(value) {
        resolve(null);
      }, function(error) {
        resolve(error);
      });
    }));

  return errorPromises;
};

let rejectWithOrderedListOfErrors = function(rejectMethod) {
  return function(errorValues) {
    let allErrors = [];

    for (let errorValue of errorValues)
      if (errorValue !== null)
        allErrors.push(errorValue);

    rejectMethod(allErrors);
  };
};

let runAndWait = function(thingToRun) {
  try {
    return Promise.resolve(thingToRun());
  } catch (error) {
    return Promise.reject(error);
  }
};

module.exports = processTree;

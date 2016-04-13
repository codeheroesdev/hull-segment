import connect from 'connect'
import https from 'https'
import _ from 'lodash'
import rawBody from 'raw-body'
import crypto from 'crypto'
import basicAuth from 'basic-auth-connect'
import jwt from 'jwt-simple'

function parseRequest() {
  return function(req, res, next) {
    req.hull = req.hull || {};
    rawBody(req, true, (err, body) => {
      if (err) {
        return res.handleError('Invalid body', 400);
      }
      try {
        req.hull.body = body;
        req.hull.message = JSON.parse(body);
      } catch (parseError) {
        return res.handleError('Invalid body', 400);
      }
      return next();
    });
  };
}

function verifyAuthToken(options) {
  const { secret } = options;
  return (req, res, next) => {
    req.hull = req.hull || {};
    if (req.headers['authorization'] && secret) {
      const [ authType, token ] = req.headers['authorization'].split(' ');
      if (authType === 'Basic' && token) {
        try {
          req.hull.config = jwt.decode(token, secret);
          next();
        } catch (err) {
          res.handleError('Invalid token', 401);
        }
      } else {
        next()
      }
    } else {
      next();
    }
  }
}

function verifySignature(options = {}) {
  return (req, res, next) => {
    if (req.headers['x-signature'] && options.secret) {
      const signature = req.headers['x-signature'];

      if (!signature) {
        return res.handleError('Missing signature', 401);
      }

      const digest = crypto
        .createHmac('sha1', options.secret)
        .update(req.hull.body)
        .digest('hex');

      if (signature == digest) {
        next();
      } else {
        return res.handleError('Invalid signature', 401);
      }
    } else {
      return next();
    }
  }
}

function enrichWithHullClient(Hull) {
  var _cache = [];

  function getCurrentShip(shipId, client, forceUpdate) {
    if (forceUpdate) _cache[shipId] = null;
    _cache[shipId] = _cache[shipId] || client.get(shipId);
    return _cache[shipId];
  }

  return (req, res, next) => {
    try {
      const config = req.hull.config || ['organization', 'ship', 'secret'].reduce((cfg, k)=> {
        const val = (req.query[k] || "").trim();
        if (typeof val === 'string') {
          cfg[k] = val;
        } else if (val && val[0] && typeof val[0] === 'string') {
          cfg[k] = val[0].trim();
        }
        return cfg;
      }, {});

      req.hull = req.hull || {};

      const { message } = req.hull;
      let forceShipUpdate = false;
      if (message && message.Subject === 'ship:update') {
        forceShipUpdate = true;
      }

      if (config.organization && config.ship && config.secret) {
        const client = req.hull.client = new Hull({
          id: config.ship,
          secret: config.secret,
          organization: config.organization
        });
        getCurrentShip(config.ship, client, forceShipUpdate).then((ship) => {
          req.hull.ship = ship;
          next();
        }, (err) => {
          res.handleError(err.message, 401);
        });
      } else {
        res.handleError("Missing credentials", 400);
      }
    } catch(err) {
      res.handleError('La cest mort: ' + err.message, 500);
    }
  };
}

function processHandlers(handlers) {
  return function(req, res, next) {
    try {
      const eventName = req.hull.message.type
      const eventHandlers = handlers[eventName];
      if (eventHandlers && eventHandlers.length > 0) {
        const context = {
          hull: req.hull.client,
          ship: req.hull.ship
        };

        const { message } = req.hull;
        if (message && message.integrations && message.integrations.Hull === false) {
          return next();
        }

        const processors = eventHandlers.map(fn => fn(req.hull.message, context));

        Promise.all(processors).then((results) => {
          next();
        }, (err) => {
          res.handleError('Failed to process message: ' + JSON.stringify(err, ' ', 2), 500);
        });
      } else {
        res.handleError('Not supported', 501);
        next();
      }
    } catch ( err ) {
      res.handleError(err.toString(), 500);
    }
  };
}


function errorHandler(onError) {
  return function(req, res, next) {
    res.handleError = function(message, status) {
      if (onError) onError(message, status);
      res.status(status);
      res.json({ message });
    };
    next();
  };
}


module.exports = function SegmentHandler(options = {}) {
  const _handlers = {};
  const app = connect();

  function addEventHandlers(eventsHash) {
    _.map(eventsHash, (fn, eventName) => addEventHandler(eventName, fn));
    return this;
  }

  function addEventHandler(eventName, fn) {
    _handlers[eventName] = _handlers[eventName] || [];
    _handlers[eventName].push(fn);
    return this;
  }

  if (options.events) {
    addEventHandlers(options.events);
  }

  app.use(errorHandler(options.onError));
  app.use(parseRequest());
  app.use(verifySignature(options));
  app.use(verifyAuthToken(options));
  app.use(enrichWithHullClient(options.Hull));
  app.use(processHandlers(_handlers));
  app.use((req, res) => { res.json({ message: "thanks" }); });

  function handler(req, res) {
    return app.handle(req, res);
  }

  handler.addEventHandler = addEventHandler;

  return handler;
};

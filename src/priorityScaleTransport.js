const Transport = require('winston-transport');
const axios = require('axios');
const _ = require('lodash');

module.exports = class PriorityScaleTransport extends Transport {
  constructor(opts) {
    super(opts);

    const prodApiUrl = 'https://api.priorityscale.io';

    this.configOpts = {
      level: _.get(opts, 'level', 'error'),
      api_key: _.get(opts, 'api_key', false),
      api_secret: _.get(opts, 'api_secret', false),
      task_type: _.get(opts, 'task_type', false),
      api_url: _.get(opts, 'api_url', prodApiUrl),
    };
  }

  async log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    if (info.level === this.configOpts.level) {
      const name = `${info.service} - ${info.message}`;
      const apiToken = await getApiToken(this.configOpts);
      const task_type_uuid = await lookupTaskType('Application Error', apiToken, this.configOpts);

      const ticketLookup = await lookupTicket(name, apiToken, this.configOpts);

      if (_.get(ticketLookup, 'uuid', false)) {
        createComment({
          task_uuid: _.get(ticketLookup, 'uuid', false),
          type: 'private',
          message: JSON.stringify(info),
        }, apiToken, this.configOpts).then(() => {});
      } else {
        createTicket({
          name: `${info.service} - ${info.message}`,
          task_type_uuid,
          description: JSON.stringify(info),
        }, apiToken, this.configOpts).then(() => {});
      }
    }

    callback();
  }
};

const getApiToken = async ({ api_key, api_secret, api_url }) => {
  const { data } = await axios({
    method: 'POST',
    url: `${api_url}/auth/api`,
    withCredentials: true,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    data: {
      key: api_key,
      secret: api_secret,
    },
  });

  if (data.status === 'success') {
    return data.accessToken;
  }
};

const createTicket = async (data, token, { api_url }) => {
  const response = await axios({
    method: 'POST',
    url: `${api_url}/tickets`,
    withCredentials: true,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    data,
  });

  return _.get(response, 'data.data', false);
};

const createComment = async (data, token, { api_url }) => {
  const response = await axios({
    method: 'POST',
    url: `${api_url}/tasks/comments`,
    withCredentials: true,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    data,
  });

  return _.get(response, 'data.data', false);
};

const lookupTicket = async (name, token, { api_url }) => {
  const response = await axios({
    method: 'GET',
    url: `${api_url}/tickets/lookup?name=${name}`,
    withCredentials: true,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  return _.get(response, 'data.data', false);
};

const lookupTaskType = async (name, token, { api_url }) => {
  const response = await axios({
    method: 'GET',
    url: `${api_url}/tasks/types?name=${name}`,
    withCredentials: true,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  return _.get(response, 'data.data.uuid', false);
};

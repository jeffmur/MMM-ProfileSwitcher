"use strict";
const path = require("path");
var NodeHelper = require("node_helper");
const { v1 } = require("@google-cloud/pubsub");
var self = this;
// export functions for use elsewhere
module.exports = NodeHelper.create({
  // Start function
  start: function () {
    console.log("[Profile-Switcher] Intitalized");
  },

  // From MMM-ProfileSwitcher
  socketNotificationReceived: function (notification, payload) {
    if (notification === "START") {
      this.syncPull().catch(console.error);
    }
  },

  // Used in Pub/Sub - Google Cloud Nodejs SDK
  // With Lease Management
  // Fetches the most recent published message
  syncPull: async function () {
    self = this;
    const projectId = "smartmirror-fba08";
    const subscriptionName = "faceRecon-sub";
    const subClient = new v1.SubscriberClient();

    const formattedSubscription = subClient.subscriptionPath(
      projectId,
      subscriptionName
    );

    // The maximum number of messages returned for this request.
    // Pub/Sub may return fewer than the number specified.
    const maxMessages = 1;
    const newAckDeadlineSeconds = 1;
    const request = {
      subscription: formattedSubscription,
      maxMessages: maxMessages,
      allowExcessMessages: false
    };

    let isProcessed = false;

    // The subscriber pulls a specified number of messages.
    const [response] = await subClient.pull(request);

    // Obtain the first message.
    let message = response.receivedMessages[0];

    if (message === undefined) {
      // Call again after 1 second
      setTimeout(() => {
        this.syncPull().catch(console.error);
      }, 1000);

      return;
    }

    let data = new String(message.message.data);

    var [profile, status] = data.split("-");
    console.log(`${profile} -> ${status}`);
    self.sendSocketNotification("USER_DETECTED", {
      profile: profile,
      status: status
    });

    // The worker function is meant to be non-blocking. It starts a long-
    // running process, such as writing the message to a table, which may
    // take longer than the default 10-sec acknowledge deadline.
    /**
     * @param message
     */
    function worker(message) {
      // console.log(`Processing "${message.message.data}"...`);

      setTimeout(() => {
        // console.log(`Finished procesing "${message.message.data}".`);
        isProcessed = true;
      }, 1000);
    }

    // Send the message to the worker function.
    worker(message);

    let waiting = true;
    while (waiting) {
      await new Promise((r) => setTimeout(r, 1000));
      // If the message has been processed..
      if (isProcessed) {
        const ackRequest = {
          subscription: formattedSubscription,
          ackIds: [message.ackId]
        };

        //..acknowledges the message.
        await subClient.acknowledge(ackRequest);
        console.log(`Acknowledged.`);
        // Exit after the message is acknowledged.
        waiting = false;
      } else {
        // If the message is not yet processed..
        const modifyAckRequest = {
          subscription: formattedSubscription,
          ackIds: [message.ackId],
          ackDeadlineSeconds: newAckDeadlineSeconds
        };

        //..reset its ack deadline.
        await subClient.modifyAckDeadline(modifyAckRequest);

        console.log(
          `Reset ack deadline for "${message.message.data}" for ${newAckDeadlineSeconds}s.`
        );
      }
    }
    setTimeout(() => {
      this.syncPull().catch(console.error);
    }, 500);
  }
});

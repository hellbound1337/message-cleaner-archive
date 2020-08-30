const { getModule, messages } = require('powercord/webpack');
const { Plugin } = require('powercord/entities');
const { get, del } = require('powercord/http');
const { sleep } = require('powercord/util');
const Settings = require('./components/Settings');

const { getChannelId } = getModule(['getLastSelectedChannelId'], false);
const { getCurrentUser } = getModule(['getCurrentUser'], false);
const { getToken } = getModule(['getToken'], false);
const { deleteMessage } = getModule(['deleteMessage', 'fetchMessages'], false);

module.exports = class ClearMessages extends Plugin {
   startPlugin() {
      this.pruning = {};

      if (!Array.prototype.chunk) {
         Object.defineProperty(Array.prototype, 'chunk', {
            value: function (size) {
               var array = [];
               for (var i = 0; i < this.length; i += size) {
                  array.push(this.slice(i, i + size));
               }
               return array;
            }
         });
      }

      if (!this.settings.get('aliases')) {
         this.settings.set('aliases', ['prune', 'purge', 'cl', 'pr']);
      }

      powercord.api.commands.registerCommand({
         command: 'clear',
         aliases: this.settings.get('aliases'),
         description: 'Clears a certain amount of messages.',
         usage: '{c} (amount) [beforeMessageId]',
         executor: (args) => this.clear(args)
      });

      powercord.api.settings.registerSettings('clear-messages', {
         category: this.entityID,
         label: 'Message Cleaner',
         render: Settings
      });
   }

   pluginWillUnload() {
      powercord.api.commands.unregisterCommand('clear');
      powercord.api.settings.unregisterSettings('clear-messages');
   }

   async clear(args) {
      const { BOT_AVATARS } = getModule(['BOT_AVATARS'], false);
      const { createBotMessage } = getModule(['createBotMessage'], false);

      this.channel = getChannelId();

      const receivedMessage = createBotMessage(this.channel, {});
      BOT_AVATARS.clear_messages = 'https://i.imgur.com/dOe7F3y.png';
      receivedMessage.author.username = 'Message Cleaner';
      receivedMessage.author.avatar = 'clear_messages';

      if (args.length === 0) {
         receivedMessage.content = 'Please specify an amount.';
         return messages.receiveMessage(receivedMessage.channel_id, receivedMessage);
      }

      if (this.pruning[this.channel] == true) {
         receivedMessage.content = `Already pruning in this channel.`;
         return messages.receiveMessage(receivedMessage.channel_id, receivedMessage);
      }

      let count = args.shift();
      let before = args.shift();

      this.pruning[this.channel] = true;

      if (count !== 'all') {
         count = parseInt(count);
      }

      if (count <= 0 || count == NaN) {
         receivedMessage.content = 'Amount must be specified.';
         return messages.receiveMessage(receivedMessage.channel_id, receivedMessage);
      }

      receivedMessage.content = `Started clearing.`;
      messages.receiveMessage(receivedMessage.channel_id, receivedMessage);

      let amount = this.settings.get('mode', 1) ? await this.burstDelete(count, before, this.channel) : await this.normalDelete(count, before, this.channel);

      delete this.pruning[this.channel];

      if (amount !== 0) {
         powercord.api.notices.sendToast(`CL_${this.channel}_${this.random(10)}`, {
            header: 'Finished Clearing Messages',
            content: `Deleted ${amount} messages in ${this.channel}.`,
            type: 'success',
            buttons: [
               {
                  text: 'Ok',
                  color: 'green',
                  size: 'small',
                  look: 'outlined'
               }
            ]
         });

         receivedMessage.content = `Cleared ${amount} messages.`;
      } else {
         receivedMessage.content = `No messages found.`;
      }

      return messages.receiveMessage(receivedMessage.channel_id, receivedMessage);
   }

   async normalDelete(count, before, channel) {
      let deleted = 0;
      let offset = 0;
      while (count == 'all' || count > deleted) {
         if (count !== 'all' && count === deleted) break;
         let get = await this.fetch(channel, getCurrentUser().id, before, offset);
         if (get.messages.length <= 0 && get.skipped == 0) break;
         offset = get.offset;
         while (count !== 'all' && count < get.messages.length) get.messages.pop();
         for (const msg of get.messages) {
            deleted += await this.deleteMsg(msg.id, channel);
            await sleep(this.settings.get('normalDelay', 350));
         }
      }
      return deleted;
   }

   async burstDelete(count, before, channel) {
      let deleted = 0;
      let offset = 0;
      while (count == 'all' || count > deleted) {
         if (count !== 'all' && count === deleted) break;
         let get = await this.fetch(channel, getCurrentUser().id, before, offset);
         if (get.messages.length <= 0 && get.skipped == 0) break;
         offset += get.offset;
         while (count !== 'all' && count < get.messages.length) get.messages.pop();
         let chunk = get.messages.chunk(this.settings.get('chunkSize', 3));
         for (const msgs of chunk) {
            let funcs = [];
            for (const msg of msgs) {
               funcs.push(async () => {
                  return await this.deleteMsg(msg.id, channel);
               });
            }
            await Promise.all(
               funcs.map((f) => {
                  return f().then((amount) => {
                     deleted += amount;
                  });
               })
            );
            await sleep(this.settings.get('burstDelay', 1000));
         }
      }

      return deleted;
   }

   async deleteMsg(id, channel) {
      let deleted = 0;
      try {
         await deleteMessage(channel, id);
      } catch {
         deleted += await this.deleteMsg(id, channel);
         return deleted;
      }
      deleted++;
      return deleted;
   }

   async fetch(channel, user, before, offset) {
      let out = [];
      let messages = await get(
         `https://discord.com/api/v6/channels/${channel}/messages/search?author_id=${user}${before ? `&max_id=${before}` : ''}${offset > 0 ? `&offset=${offset}` : ''}`
      )
         .set('User-Agent', navigator.userAgent)
         .set('Authorization', getToken())
         .catch(async (err) => {
            switch (err.statusCode) {
               case 429:
                  this.log(`Ratelimited while fetching. Waiting ${err.body.retry_after}ms`);
                  await sleep(err.body.retry_after);
                  return this.fetch(channel, user, before);
               default:
                  this.log(`Couldn't fetch (Response: ${err.statusCode})`);
                  break;
            }
         });
      if (messages.body.message && messages.body.message.startsWith('Index')) {
         await sleep(messages.body.retry_after);
         return await this.fetch(channel, user, before, offset);
      }

      let msgs = messages.body.messages;
      if (!msgs.length) {
         return {
            messages: [],
            offset: offset,
            skipped: 0
         };
      }

      let skippedMsgs = 0;
      for (let bulk of msgs) {
         bulk = bulk.filter((msg) => msg.hit == true);
         out.push(...bulk.filter((msg) => msg.type === 0 || msg.type === 6));
         skippedMsgs += bulk.filter((msg) => !out.find((m) => m.id === msg.id)).length;
      }

      await sleep(this.settings.get('searchDelay', 200));

      return {
         messages: out.sort((a, b) => b.id - a.id),
         offset: skippedMsgs + offset,
         skipped: skippedMsgs
      };
   }

   async random(length) {
      var result = '';
      var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      var charactersLength = characters.length;
      for (var i = 0; i < length; i++) {
         result += characters.charAt(Math.floor(Math.random() * charactersLength));
      }
      return result;
   }
};

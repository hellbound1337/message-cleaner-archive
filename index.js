const { React, getModule, messages, getModuleByDisplayName } = require('powercord/webpack');
const sleep = async ms => new Promise(done => setTimeout(done, ms));
const { inject, uninject } = require('powercord/injector');
const { open: openModal } = require('powercord/modal');
const { Tooltip } = require('powercord/components');
const PruneIcon = require('./components/PruneIcon');
const { Plugin } = require('powercord/entities');
const { get, del } = require('powercord/http');
const Modal = require('./components/Modal');
const Settings = require('./Settings');
const { receiveMessage } = messages;

if (!Array.prototype.chunk) {
   Object.defineProperty(Array.prototype, 'chunk', {
      value: function (chunkSize) {
         var R = [];
         for (var i = 0; i < this.length; i += chunkSize)
            R.push(this.slice(i, i + chunkSize));
         return R;
      }
   });
}

module.exports = class ClearMessages extends Plugin {
   pruning = [];
   token = '';

   startPlugin() {
      if (this.settings.get('mode') == null)
         this.settings.set('mode', 1);

      if (this.settings.get('chunkSize') == null)
         this.settings.set('chunkSize', 3);

      if (this.settings.get('burstDelay') == null)
         this.settings.set('burstDelay', 1000);

      if (this.settings.get('normalDelay') == null)
         this.settings.set('normalDelay', 150);

      if (this.settings.get('searchDelay') == null)
         this.settings.set('searchDelay', 200);

      if (this.settings.get('aliases') == null)
         this.settings.set('aliases', ['prune', 'purge', 'cl', 'pr'])



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

      const { getChannelId } = getModule(['getLastSelectedChannelId'], false);
      const { getCurrentUser } = getModule(['getCurrentUser'], false);
      const { getToken } = getModule(['getToken'], false)
      this.getChannelId = getChannelId
      this.getCurrentUser = getCurrentUser
      this.getToken = getToken

      // this.addIcon();
   }

   pluginWillUnload() {
      powercord.api.commands.unregisterCommand('clear');
      powercord.api.settings.unregisterSettings('clear-messages');
      // uninject('prune-icon');
   }

   async clear(args) {
      const { BOT_AVATARS } = await getModule(['BOT_AVATARS']);
      const { createBotMessage } = await getModule(['createBotMessage']);

      this.channel = this.getChannelId();

      const receivedMessage = createBotMessage(this.channel, {});

      BOT_AVATARS.clear_messages = 'https://i.imgur.com/dOe7F3y.png';
      receivedMessage.author.username = 'Message Cleaner';
      receivedMessage.author.avatar = 'clear_messages';

      if (args.length === 0) {
         receivedMessage.content = "Please specify an amount.";
         return receiveMessage(receivedMessage.channel_id, receivedMessage);
      }

      if (this.pruning[this.channel] == true) {
         receivedMessage.content = `Already pruning in this channel.`;
         return receiveMessage(receivedMessage.channel_id, receivedMessage);
      }

      let count = args.shift();
      let before = args.shift();

      this.pruning[this.channel] = true

      if (count !== 'all') {
         count = parseInt(count);
      }

      if (count <= 0 || count == NaN) {
         receivedMessage.content = "Amount must be specified.";
         return receiveMessage(receivedMessage.channel_id, receivedMessage);
      }

      receivedMessage.content = `Pruning Started.`;
      receiveMessage(receivedMessage.channel_id, receivedMessage);

      let amount = this.settings.get('mode') ? await this.burstDelete(count, before, this.channel) : await this.normalDelete(count, before, this.channel)

      delete this.pruning[this.channel]

      if (amount !== 0) {
         powercord.api.notices.sendToast(`ClearedMsgNotif_${this.channel}_${parseInt((Math.random()).toString().substr(2)).toString(16)}`, {
            header: 'Finished Clearing Messages',
            content: `Deleted ${amount} messages in ${this.channel}.`,
            type: 'success',
            buttons: [{
               text: 'Ok',
               color: 'green',
               size: 'small',
               look: 'outlined',
            }],
         });

         receivedMessage.content = `Deleted ${amount} messages.`;
      } else {
         receivedMessage.content = `No messages found.`;
      }

      return receiveMessage(receivedMessage.channel_id, receivedMessage);
   }

   async normalDelete(count, before, channel) {
      let deleted = 0;
      let offset = 0;
      while (count == 'all' || count > deleted) {
         if (count !== 'all' && count === deleted) break;
         let get = await this.fetch(channel, this.getCurrentUser().id, before, offset);
         if (get.messages.length <= 0 && get.skipped == 0) break;
         offset += get.offset
         while (count !== 'all' && count < get.messages.length) get.messages.pop()
         for (const msg of get.messages) {
            await sleep(this.settings.get('normalDelay'));
            deleted += await this.deleteMsg(msg.id, channel);
         }
      }
      return deleted;
   }

   async burstDelete(count, before, channel) {
      let deleted = 0;
      this.offset = 0;
      while (count == 'all' || count > deleted) {
         if (count !== 'all' && count === deleted) break;
         let get = await this.fetch(channel, this.getCurrentUser().id, before, this.offset);
         this.offset = get.offset
         if (get.messages.length <= 0 && get.skipped == 0) break;
         while (count !== 'all' && count < get.messages.length) get.messages.pop()
         let chunk = get.messages.chunk(this.settings.get('chunkSize'))
         for (const msgs of chunk) {
            let funcs = [];
            for (const msg of msgs) {
               funcs.push(async () => {
                  return await this.deleteMsg(msg.id, channel)
               });
            }
            await Promise.all(funcs.map(f => {
               return f().then(amount => {
                  deleted += amount
               })
            }))
            await sleep(this.settings.get('burstDelay'));
         }
      }

      return deleted;
   }

   async deleteMsg(id, channel) {
      let deleted = 0;
      await del(`https://discord.com/api/v7/channels/${channel}/messages/${id}`).set('Authorization', this.getToken())
         .then(() => {
            deleted++
         })
         .catch(async err => {
            switch (err.statusCode) {
               case 404:
                  this.log(`Can't delete ${id} (Already deleted?)`);
                  break;
               case 429:
                  await sleep(err.body.retry_after);
                  deleted += await this.deleteMsg(id, channel);
                  break;
               default:
                  this.log(`Can't delete ${id} (Response: ${err.statusCode})`);
                  break;
            }
         });
      return deleted;
   }

   async fetch(channel, user, before, offset) {
      let out = [];
      let messages = await get(`https://discord.com/api/v7/channels/${channel}/messages/search?author_id=${user}${before ? `&max_id=${before}` : ''}${offset > 0 ? `&offset=${offset}` : ''}`).set('Authorization', this.getToken())
         .catch(async err => {
            switch (err.statusCode) {
               case 429:
                  await sleep(err.body.retry_after);
                  return this.fetch(channel, user, before);
               default:
                  this.log(`Couldn't fetch (Response: ${err.statusCode})`);
                  break;
            }
         });
      if (messages.body.message && messages.body.message.startsWith('Index')) {
         await sleep(messages.body.retry_after)
         return this.fetch(channel, user, before, offset)
      }
      let msgs = messages.body.messages;
      let skippedMsgs = 0;
      for (const bulk of msgs) {
         out.push(...bulk.filter(m => m.hit == true && m.type == 0));
         skippedMsgs += bulk.filter(msg => !out.find(m=> m.id === msg.id));
      }
      await sleep(this.settings.get('searchDelay'));
      return {
         messages: out.sort((a, b) => b.id - a.id),
         offset: skippedMsgs + offset,
         skipped: skippedMsgs
      };
   }

   async addIcon() {
      const classes = await getModule(['iconWrapper', 'clickable']);
      const HeaderBarContainer = await getModuleByDisplayName('HeaderBarContainer');

      inject('prune-icon', HeaderBarContainer.prototype, 'renderLoggedIn', (args, res) => {
         const Switcher = React.createElement(Tooltip, {
            text: 'Clear Messages',
            position: 'bottom'
         }, React.createElement('div', {
            className: ['prune-icon', classes.iconWrapper, classes.clickable].join(' ')
         }, React.createElement(PruneIcon, {
            className: ['prune-icon', classes.icon].join(' '),
            onClick: async () => openModal(() => React.createElement(Modal, { scripts: this }))
         })));

         if (!res.props.toolbar) {
            res.props.toolbar = Switcher;
         } else {
            res.props.toolbar.props.children.push(Switcher);
         }

         return res;
      })
   }
}

const { React, getModule } = require('powercord/webpack');
const { get } = require('powercord/http');
const { Button } = require("powercord/components");
const { Modal } = require("powercord/components/modal");
const { FormTitle } = require("powercord/components");
const { SelectInput, TextInput, SwitchItem } = require("powercord/components/settings")
const { close: closeModal } = require("powercord/modal");

module.exports = class ClearModal extends React.PureComponent {
   constructor(props) {
      super(props);

      this.scripts = props.scripts;
      this.guilds = props.guilds;

      this.state = {
         channel: this.scripts.getChannelId(),
         author: this.scripts.getCurrentUser().id,
         search: null,
         beforeId: null,
         afterId: null,
         hasLink: false,
         hasFile: false,
         includePinned: true
      }
   }

   render() {
      var guilds = Object.values(this.props.guilds());
      return (
         <Modal size={Modal.Sizes.LARGE} style={{ "height": "75vh" }}>
            <Modal.Header>
               <FormTitle tag="h3">
                  Clear Messages
               </FormTitle>
               <Modal.CloseButton onClick={closeModal} />
            </Modal.Header>
            <Modal.Content>
               <TextInput
                  note="Specify the amount of messages to be deleted (Leave blank for all)"
               >
                  Amount
               </TextInput>
               <TextInput
                  note="Specify the channel (Has to be a channel ID)"
                  defaultValue={this.state.channel}
                  value={this.state.channel}
                  onInput={(event) => {
                     this.setState({ channel: event.target.value });
                  }}
               >
                  Channel
               </TextInput>
               <TextInput
                  note="Specify the author (Has to be a user ID)"
                  value={this.state.author}
                  onInput={(event) => {
                     this.setState({ author: event.target.value });
                  }}
               >
                  Author
               </TextInput>
               <TextInput
                  note="Specify a search filter (Works like the search bar)"
                  value={this.state.search}
                  onInput={(event) => {
                     this.setState({ search: event.target.value });
                  }}
               >
                  Search
               </TextInput>
               <TextInput
                  note="Specify before what message ID does the Message Cleaner search"
                  value={this.state.beforeId}
                  onInput={(event) => {
                     this.setState({ beforeId: event.target.value });
                  }}
               >
                  Before Message ID
               </TextInput>
               <TextInput
                  note="Specify after what message ID does the Message Cleaner search"
                  value={this.state.afterId}
                  onInput={(event) => {
                     this.setState({ afterId: event.target.value });
                  }}
               >
                  Before After ID
               </TextInput>
               <SwitchItem
                  value={this.state.hasLink}
                  onChange={(v) => { this.setState({ hasLink: v.target.checked }) }}
               >
                  Has Link
               </SwitchItem>
               <SwitchItem
                  value={this.state.hasFile}
                  onChange={(v) => { this.setState({ hasFile: v.target.checked }) }}
               >
                  Has File
               </SwitchItem>
               <SwitchItem
                  value={this.state.includePinned}
                  onChange={(v) => { this.setState({ includePinned: v.target.checked }) }}
               >
                  Include Pinned
               </SwitchItem>
            </Modal.Content>
            <Modal.Footer
               style={{ zIndex: "-1" }}
            >
               <Button
                  onClick={async () => { }}
                  color={Button.Colors.GREEN}
               >
                  Start
               </Button>

               <Button
                  onClick={closeModal}
                  look={Button.Looks.LINK}
                  color={Button.Colors.TRANSPARENT}
               >
                  Cancel
               </Button>

            </Modal.Footer>
         </Modal >
      );
   }
}
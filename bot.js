const Discord = require('discord.js');

const auth = require('./auth.json');
const messages = require('./messages.js');
const majorsInfo = require('./majorsInfo.js');
const {RateLimiter, isUserAdminOrMod, getUserFromMention} = require('./helpers.js');

// 1.5 second cooldown to limit spam
const COMMAND_COOLDOWN = 1 * 1000;

// Initialize Discord Bot
const client = new Discord.Client();
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Assigns the given user the given role. Returns true if successful, false if not.
function assignRole(user, major) {
  try {
    const guild = client.guilds.first();
    const role = guild.roles.find(({ name }) => name === major);
    if (!role) {
      throw new Error(`Intended role not found on server`);
    }

    const member = guild.member(user);
    if (member.roles.find(currRole => currRole === role)) {
      return {
        success: false,
        error: 'You already have that role.',
      };
    }

    if (!member.roles.find(({ name }) => name === 'Student')) {
      return {
        success: false,
        error: 'You have to be a student to receive a major. Please go to the #role-assignment channel to do so.'
      };
    }

    // Remove any other major role/s the user already has.
    member.roles.forEach(role => {
      if (majorsInfo.fullToAbbrev[role.name]) {
        member.removeRole(role);
      }
    });

    member.addRole(role);
    return { success: true };
  } catch (err) {
    console.error(`Failed to assign ${major} to ${user.username}.`);
    console.error(err);
    return {
      success: false,
      error: `Failed to assign major for unknown reason. Please PM "@egrodo#5991", my creator.`
    };
  }
}

// Generic message handler with logic to handle major assignments.
function msgHandler(msg) {
  if (msg.content === '!roles') {
    msg.author.send(messages.askMajor);
    return;
  }

  // If the bot is mentioned, check for commands to respond to.
  if (msg.isMemberMentioned(client.user) && isUserAdminOrMod(client, msg.author)) {
    const splitMsg = msg.content.split(/\s+/);
    const command = splitMsg[1] || 'Unrecognized';
    switch (command.toLowerCase()) {
      case "askmajor":
        if (splitMsg.length < 3) {  
          msg.reply(`Invalid syntax. Type "@BearcatBot askmajor @USER"`);
          break;
        }

        const mention = splitMsg[2];
        const askedMember = getUserFromMention(client, mention);

        if (!askedMember || askedMember.id === client.user.id) {
          msg.reply(`Invalid syntax. Type "@BearcatBot askmajor @USER"`);
        } else {
          msg.channel.send(`Okay, I'll PM ${askedMember.username} for their major.`);
          askedMember.send(messages.askMajor);
        }
        break;
      default:
        msg.reply('Unrecognized command');
        break;
    }
  }

  // Otherwise if not a DM stop message processing.
  if (msg.channel.type !== 'dm') {
    return;
  }

  const givenMajor = msg.content.toUpperCase();
  let resolvedMajor = majorsInfo.abbrevToFull[givenMajor];
  if (resolvedMajor) {
    const result = assignRole(msg.author, resolvedMajor);
    if (result.success) {
      msg.reply(`Successfully assigned you the role "${resolvedMajor}".`);
    } else {
      msg.reply(result.error)
    }
  } else {
    msg.reply(`Invalid input, please type exactly one of the roles listed above. Type "!roles" to see the list again.`);
  }
}

// Check if the user received the "Student" role, and if so, start the major assignment flow.
function memberUpdateHandler(oldMember, newMember) {
  if (
    !oldMember.roles.find(({ name }) => name === 'Student') && newMember.roles.find(({ name }) => name === 'Student')
  ) {
    newMember.user.send(messages.askMajor);
    console.log(`Sent major request to new student ${newMember.user.username}.`);
  }
}

const limitedMessageHandler = RateLimiter(COMMAND_COOLDOWN, msgHandler);
client.on('message', limitedMessageHandler);

client.on('guildMemberUpdate', memberUpdateHandler);

client.login(auth.token);

// TODO: Make command that will let an admin invoke the greeting on any specified user.
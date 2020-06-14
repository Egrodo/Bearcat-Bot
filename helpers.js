const Discord = require("discord.js");

// User specific debounce function
module.exports = {
  RateLimiter: (delay, fn) => {
    const userMap = new Map();

    return (msg) => {
      // Don't rate limit myself.
      if (msg.author.bot) {
        return;
      }

      if (userMap.has(msg.author.id)) {
        clearTimeout(userMap.get(msg.author.id));
      }

      userMap.set(
        msg.author.id,
        setTimeout(() => {
          fn(msg);
          userMap.delete(msg.author.id);
        }, delay)
      );
    };
  },
  getMemberFromUser: (client, user) => client.guilds.first().member(user),
  userHasRoles: (member) => member.roles.last().name !== "@everyone",
  isStudentOrGradStudent: (member) => {
    if (
      member.roles.find(({ name }) => name === "Student") ||
      member.roles.find(({ name }) => name === "Grad Student")
    ) {
      return true;
    }
    return false;
  },
  isUserAdminOrMod: (client, user) => {
    const member = client.guilds.first().member(user);
    return member.hasPermission("ADMINISTRATOR");
  },
  getUserFromMention: (client, mention) => {
    if (!mention) return;

    if (mention.startsWith("<@") && mention.endsWith(">")) {
      mention = mention.slice(2, -1);

      if (mention.startsWith("!")) {
        mention = mention.slice(1);
      }

      return client.users.get(mention);
    } else if (!isNaN(mention)) {
      // Allow the user to invoke askmajor with a direct userid rather than @'ing them.
      return client.users.get(mention);
    }
  },
  isRedditPostingTime: () => {
    // If the time is: 6am, 2pm, 10pm, return true. Else return false.
    const time = new Date().getHours();
    return time === 6 || time === 14 || time === 22
  },
};

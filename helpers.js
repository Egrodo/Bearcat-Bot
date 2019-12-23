const Discord = require('discord.js');

// User specific debounce function
module.exports = {
  RateLimiter: (delay, fn) => {
    const userMap = new Map();

    return (msg => {
      // Don't rate limit myself.
      if (msg.author.bot) {
        return;
      }

      if (userMap.has(msg.author.id)) {
        clearTimeout(userMap.get(msg.author.id));
      }

      userMap.set(msg.author.id, setTimeout(() => {
        fn(msg);
        userMap.delete(msg.author.id);
      }, delay))
    });
  },
  isUserAdminOrMod: (client, user) => {
    const member = client.guilds.first().member(user);
    return member.hasPermission("ADMINISTRATOR");
  },
  getUserFromMention: (client, mention) => {
    if (!mention) return;

    if (mention.startsWith('<@') && mention.endsWith('>')) {
      mention = mention.slice(2, -1);
  
      if (mention.startsWith('!')) {
        mention = mention.slice(1);
      }
  
      return client.users.get(mention);
    }
  }
}
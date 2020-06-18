const Discord = require("discord.js");
const Phin = require("phin");

const auth = require("./auth.json");
const messages = require("./messages.js");
const majorsInfo = require("./majorsInfo.js");
const {
  RateLimiter,
  getMemberFromUser,
  isUserAdminOrMod,
  isStudentOrGradStudent,
  getUserFromMention,
  userHasRoles,
  isRedditPostingTime,
} = require("./helpers.js");

// 1.5 second cooldown to limit spam
const COMMAND_COOLDOWN = 1 * 1000;
// Reddit API link
const REDDIT_URL = 'https://www.reddit.com/r/baruch.json?limit=10';
// Channel ID of channel used for posting reddit links
const REDDIT_POSTING_CHANNEL_ID = '723038653751885825';

// Initialize Discord Bot
const client = new Discord.Client();
client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
  redditInterval();
});

/* TODO:
   - Every 8 hours post the top hot post from /r/Baruch
*/

// Assigns the given user the given role. Returns true if successful, false if not.
function assignMajorRole(user, major) {
  try {
    const guild = client.guilds.first();
    const role = guild.roles.find(({ name }) => name === major);
    if (!role) {
      throw new Error(`Intended role not found on server`);
    }

    const member = guild.member(user);
    if (member.roles.find((currRole) => currRole === role)) {
      return {
        success: false,
        error: "You already have that role.",
      };
    }

    if (!member.roles.find(({ name }) => name === "Student")) {
      return {
        success: false,
        error:
          "You have to be a student to receive a major. Please go to the #role-assignment channel to assign yourself as a student.",
      };
    }

    // Remove any other major role/s the user already has.
    member.roles.forEach((role) => {
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
      error: `Failed to assign major for unknown reason. Please PM "@egrodo#5991", the Discord server's admin.`,
    };
  }
}

function getProfRatings(profName, channel) {
  const searchProfsUrl = `https://solr-aws-elb-production.ratemyprofessors.com//solr/rmp/select/?solrformat=true&rows=20&wt=json&q=${profName}+AND+schoolid_s%3A222&defType=edismax&qf=teacherfirstname_t\%5E2000+teacherlastname_t%5E2000+teacherfullname_t%5E2000+autosuggest&bf=pow(total_number_of_ratings_i%2C2.1)&sort=total_number_of_ratings_i+desc&siteName=rmp&rows=20&start=0&fl=pk_id+teacherfirstname_t+teacherlastname_t+total_number_of_ratings_i+averageratingscore_rf+schoolid_s`;

  // First search for the professor and store preliminary information
  let rating, profId, profLastName, ratingsCount;
  Phin({ url: searchProfsUrl, parse: "json" })
    .then((res) => {
      const foundProfs = res.body.response.docs || undefined;
      // Assume the user is talking about the most relevant professor.
      if (foundProfs && foundProfs.length) {
        rating = foundProfs[0].averageratingscore_rf;
        profId = foundProfs[0].pk_id;
        profLastName = foundProfs[0].teacherlastname_t;
        ratingsCount = foundProfs[0].total_number_of_ratings_i;

        if (!rating || !profId) {
          throw new Error("Professor API response malformed");
        }
      }
    })
    .then(() => {
      if (rating && profId && profLastName && ratingsCount) {
        // Now that we have the profId, send another request to get more information.
        const profInfoUrl = `https://www.ratemyprofessors.com/paginate/professors/ratings?tid=${profId}&max=10&cache=true`;
        Phin({ url: profInfoUrl, parse: "json" })
          .then((res) => {
            console.log(res.body);

            const profUrl = `https://www.ratemyprofessors.com/ShowRatings.jsp?tid=${profId}&showMyProfs=true`;
            channel.send(
              `Professor ${profLastName} is rated ${rating}/5 with ${ratingsCount} reviews. View the ratings here: ${profUrl}`
            );
          })
          .catch((err) => console.error(err));
      } else {
        channel.send("No professors found with that name.");
      }
    })
    .catch((err) => {
      console.error(err);
    });
}

function msgHandler(msg) {
  if (msg.content === "!roles") {
    if (!isStudentOrGradStudent(getMemberFromUser(client, msg.author))) {
      msg.author.send(
        "You have to be a student to receive a major. Please go to the #role-assignment channel to assign yourself as a student."
      );
      return;
    }
    msg.author.send(messages.askMajor);
    return;
  }

  const splitMsg = msg.content.split(/\s+/);
  const command = splitMsg[0] || "Unrecognized";
  if (command.toLowerCase() === "!profrating" || command.toLowerCase() === "!rmp") {
    const profName = splitMsg.slice(1, splitMsg.length).join(" ");
    getProfRatings(profName, msg.channel);
    return;
  }

  // If the bot is mentioned by an admin, check for commands to respond to.
  if (msg.isMemberMentioned(client.user)) {
    const splitMsg = msg.content.split(/\s+/);
    const command = splitMsg[1] || "Unrecognized";
    // Call the RMP API and get prof rating information
    if (command.toLowerCase() === "profrating" || command.toLowerCase() === "rmp") {
      const profName = splitMsg.slice(2, splitMsg.length).join(" ");
      getProfRatings(profName, msg.channel);
      return;
    }

    if (isUserAdminOrMod(client, msg.author)) {
      switch (command.toLowerCase()) {
        case "askmajor":
          if (splitMsg.length < 3) {
            msg.reply(`Invalid syntax. Type "@Bearcat Bot askmajor @USER" or "@Bearcat Bot askmajor USERID"`);
            break;
          }

          const mention = splitMsg[2];
          const askedMember = getUserFromMention(client, mention);

          if (!askedMember || askedMember.id === client.user.id) {
            msg.reply(`Invalid syntax. Type "@Bearcat Bot askmajor @USER" or "@Bearcat Bot askmajor USERID"`);
          } else {
            msg.channel.send(`PMing ${askedMember.username} for their major.`);
            askedMember.send(messages.askMajor);
          }
          break;
        case "profrating":
          break;
        default:
          msg.reply("Unrecognized command");
          break;
      }
    }
  }

  // Otherwise if not a DM stop message processing.
  if (msg.channel.type !== "dm") {
    return;
  }

  // If it's a DM check for valid major and process.
  const givenMajor = msg.content.toUpperCase();
  const resolvedMajor = majorsInfo.abbrevToFull[givenMajor];
  if (resolvedMajor) {
    const result = assignMajorRole(msg.author, resolvedMajor);
    if (result.success) {
      msg.reply(`Successfully assigned you the role "${resolvedMajor}".`);
    } else {
      msg.reply(result.error);
    }
  } else {
    msg.reply(`Invalid input, please type exactly one of the roles listed above. Type "!roles" to see the list again.`);
  }
}

// Check if the user received the "Student" role, and if so, start the major assignment flow.
function memberUpdateHandler(oldMember, newMember) {
  if (!isStudentOrGradStudent(oldMember) && isStudentOrGradStudent(newMember)) {
    newMember.user.send(messages.askMajor);
    console.log(`Sent major request to new student ${newMember.user.username}.`);
  } else if (!userHasRoles(newMember)) {
    try {
      const guild = client.guilds.first();
      const role = guild.roles.find(({ name }) => name === "Unknown Role");
      newMember.addRole(role);
      console.log(`Assigned Unknown Role to new user (${newMember.user.username}) who removed theirs`);
    } catch (err) {
      console.error("Failed to assign Unknown Role to new user");
      console.error(err);
    }
  }
}
// Also run once on startup of script
// Will post if all conditions are met (time is correct, post is not stickied, post have not been posted)
const redditInterval = async () => {
  const shouldPost = isRedditPostingTime();
  if (!shouldPost) return;
  try {
    const res = await Phin({ url: REDDIT_URL, parse: "json" });
    const postList = res.body.data.children;
    let validPost = null;
    let startAt = 0;
    while (!validPost) {
      const [postLink, position] = getNthNonStickiedPost(postList, startAt);
      if (await havePostedAlready(postLink)) {
        startAt = position + 1;
        continue;
      } else {
        validPost = postLink;
      }
    }
    const channel = await client.channels.get(REDDIT_POSTING_CHANNEL_ID);
    channel.send(validPost);
  } catch(error) {
    console.error(error);
  } 
}






const limitedMessageHandler = RateLimiter(COMMAND_COOLDOWN, msgHandler);
client.on("message", limitedMessageHandler);

client.on("guildMemberUpdate", memberUpdateHandler);


// Every hour check if the current time is within the ranges
setInterval(redditInterval, 60 * 60 * 1000);

// Takes a post, finds out if we've already posted it in the relevant channel, returns boolean.
async function havePostedAlready(postLink) {
  const channel = await client.channels.get(REDDIT_POSTING_CHANNEL_ID);

  const messages = await channel.fetchMessages({limit: 10});
  const foundMessage = messages.find(currentMessage => currentMessage.content === postLink);
  return Boolean(foundMessage)
}


// Returns the nth non-stickied post in postList
function getNthNonStickiedPost(postList, startAt = 0) {
    for (let i = startAt; i < postList.length; i++) {
        if (postList[i].data.stickied === true) {
          continue; 
        } else return [`https://reddit.com${postList[i].data.permalink}`, i];
    }
    throw new Error('No non stickied posts found');
} 

client.login(auth.token);

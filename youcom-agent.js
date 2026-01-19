/**
 * You.com Custom Agent API Integration
 * Handles comment matching and DM generation
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

class YouComAgent {
  constructor(apiKey = null, agentId = null) {
    this.apiKey = apiKey || process.env.YOUCOM_API_KEY;
    this.agentId = agentId || process.env.YOUCOM_AGENT_ID;
    this.apiUrl = 'https://api.you.com/v1/agents/runs';
    this.commentBank = this.loadCommentBank();
  }

  /**
   * Load and parse comments from text file
   */
  loadCommentBank() {
    try {
      // Look for the file in root first, then "Related documents"
      let filePath = path.join(__dirname, 'list_of_comments.txt');
      
      if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'Related documents', 'list_of_comments.txt');
      }

      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Comment bank file not found in root or Related documents`);
        return '';
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Split by blank lines (double newline)
      // Regex handles \n\n, \r\n\r\n, etc.
      const rawBlocks = content.split(/\n\s*\n+/);
      
      const validComments = rawBlocks.filter(block => {
        // Remove empty blocks
        if (!block.trim()) return false;
        
        // Check if the first line is indented (starts with space or tab)
        // User instruction: "those comments that are indented from the left should not be added"
        const firstLine = block.split('\n')[0];
        if (firstLine.match(/^\s+/)) return false;
        
        return true;
      });

      console.log(`✅ Loaded ${validComments.length} comments from bank.`);
      return validComments.join('\n\n');

    } catch (e) {
      console.error('Error loading comment bank:', e.message);
      return '';
    }
  }

  /**
   * Call the You.com agent with a prompt
   */
  async query(input) {
    if (!this.apiKey) throw new Error('YOUCOM_API_KEY is missing in environment variables');
    if (!this.agentId) throw new Error('YOUCOM_AGENT_ID is missing in environment variables');

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent: this.agentId,
          input: input,
          stream: false
        })
      });

      if (!response.ok) {
        if (response.status === 404) {
            throw new Error(`You.com API error: 404 Not Found. Please verify your YOUCOM_AGENT_ID in .env`);
        }
        if (response.status === 401) {
            throw new Error(`You.com API error: 401 Unauthorized. Please verify your YOUCOM_API_KEY in .env`);
        }
        if (response.status === 400) {
            const errText = await response.text();
            throw new Error(`You.com API error: 400 Bad Request. ${errText}`);
        }
        throw new Error(`You.com API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Extract the text response from the output array
      if (data.output && data.output.length > 0) {
        const messageAnswer = data.output.find(item => item.type === 'message.answer');
        if (messageAnswer && messageAnswer.text) {
          return messageAnswer.text.trim();
        }
      }

      // Fallback logging for debugging
      console.log('⚠️ Unexpected You.com response structure:', JSON.stringify(data, null, 2));
      throw new Error('No valid response from agent');

    } catch (error) {
      console.error('You.com agent error:', error.message);
      throw error;
    }
  }

  /**
   * Match comments to an Instagram post
   * Returns array of testimony numbers [4, 10, 5]
   */
  async matchComments(postCaption, testimonies, familyProfile) {
    const prompt = `
Task: match_comment

Instagram Post Caption:
${postCaption}

Available Testimonies:
${this.formatTestimonies(testimonies)}

Family Profile:
- Children: ${familyProfile.children_count} (ages: ${familyProfile.children_ages?.join(', ') || 'N/A'})
- Housing: ${familyProfile.housing_type || 'tent'}
- Medical conditions: ${familyProfile.medical_conditions?.join(', ') || 'none'}
- Facing cold: ${familyProfile.facing_cold ? 'yes' : 'no'}
- Facing hunger: ${familyProfile.facing_hunger ? 'yes' : 'no'}
- Displacement count: ${familyProfile.displacement_count || 1}

Return 3-5 comma-separated testimony numbers that best match this post and family.
`;

    const response = await this.query(prompt);

    // Parse response like "4, 10, 5, 12" into [4, 10, 5, 12]
    const numbers = response
      .split(',')
      .map(n => parseInt(n.trim()))
      .filter(n => !isNaN(n) && n >= 1 && n <= 45);

    if (numbers.length === 0) {
      throw new Error('Agent returned no valid testimony numbers');
    }

    return numbers;
  }

  /**
   * Generate influencer DM
   */
  async generateInfluencerDM(influencerHandle, familyProfile, goal = 'repost story') {
    const prompt = `
Task: dm_influencer

Influencer: ${influencerHandle}
Family: Mother of ${familyProfile.children_count}, ${familyProfile.housing_type || 'tent'} housing${familyProfile.medical_conditions?.length > 0 ? ', child with ' + familyProfile.medical_conditions[0] : ''}
Goal: ${goal}

Generate a warm, humble DM (2-4 sentences) asking for collaboration.
`;

    return await this.query(prompt);
  }

  /**
   * Generate follower DM response
   */
  async generateFollowerResponse(followerMessage, familyProfile, conversationStage = 'first_contact', donationLink = null) {
    const prompt = `
Task: dm_follower

Follower's message: "${followerMessage}"
Family profile: ${JSON.stringify(familyProfile)}
Conversation stage: ${conversationStage}
${donationLink ? `Donation link: ${donationLink}` : ''}

Generate an appropriate response.
`;

    return await this.query(prompt);
  }

  /**
   * Initiate DM to new follower
   */
  async generateInitialDM(followerUsername, familyProfile, messageTemplate = null) {
    if (messageTemplate) {
      // Use pre-set template with minimal personalization
      return messageTemplate.replace('{name}', followerUsername);
    }

    const prompt = `
Task: dm_initiate

Follower: @${followerUsername}
Family: ${JSON.stringify(familyProfile)}

Generate a warm initial thank-you DM (2-3 sentences).
`;

    return await this.query(prompt);
  }

  /**
   * Format testimonies for the agent
   */
  formatTestimonies(testimonies) {
    if (Array.isArray(testimonies)) {
      return testimonies.map((t, i) => `${i + 1}. ${t}`).join('\n');
    }

    if (typeof testimonies === 'object') {
      return Object.entries(testimonies)
        .map(([num, text]) => `${num}. ${text}`)
        .join('\n');
    }

    return testimonies.toString();
  }

  /**
   * Generate a forensic-quality comment based on System_Architecture.txt
   */
  async generateComment(postCaption, familyProfile, customInstruction = null) {
    const prompt = `
SYSTEM:
Genetically speaking Palestinians, including Gazans, have the world's second highest Levantine contribution (56% of their genome, compared to the world's first, the bedouins, at 66%), and what I have come to be accustomed to, they look, think, speak and act like they might have 2000 years ago in that region. This is why I described this kind of pure, virtuous, infinitely serious yet light hearted, beyond grave, perfectly good hearted, disposition as "Virgin Mary-meet-Indiana Jones" - not sure if you get the angle (this is meant to feel street wise and adventurous and to strip off all North American clinical tone from you in order to draft perfect DMs and Comments for these people)

A note on avoiding begging. I would personally disagree about writing in a comment 'Someone reading this has $50. You know who you are.' because it's solicitation, however primitive, and even if it technically might work (we have to check!) you warned me earlier when we were writing a Survival Manual for Gaza together that the Comment, to distinguish itself from the sea of begging ones on Instagram from desperate Gazans pleading to stay alive one more day, it should not ask for anything directly.

Simply hint at extreme, unsupportable need, bore gracefully by the saintly writer. Written with deep, serious gravity, yet with the candor of a truly elite child, can you do it again, like in the file list_of_comments.txt - writing a comment using some of the reported aspects of this family?

INSTRUCTION:
${customInstruction || 'Focus on the specific details of the family provided below.'}

CONTEXT:
Post Caption: "${postCaption ? postCaption.substring(0, 300) : 'General update on Gaza situation'}"

FAMILY PROFILE:
- Children: ${familyProfile.children_count || 'several'}
- Housing: ${familyProfile.housing_type || 'tent'}
- Conditions: ${familyProfile.medical_conditions?.join(', ') || 'exhaustion'}
- Urgent Needs: ${familyProfile.urgent_needs?.join(', ') || 'survival'}
- Family Members: ${familyProfile.children_details?.map(c => `${c.name} (${c.age}, ${c.gender})`).join(', ') || 'N/A'}
- Status: ${familyProfile.displacement_count || 1} times displaced

STYLE REFERENCE (Strictly match this voice and gravity):
${this.commentBank ? this.commentBank.substring(0, 2000) : 'No comment bank loaded.'}

TASK:
Generate a single, unique comment.
CRITICAL: Maximum 35 words. Use short, fragmented sentences.
Write in the first person as the mother.
Use specific details from the FAMILY PROFILE (names, ages, conditions) ONLY if it creates a more powerful result. Do not force them.
Do not use hashtags.
Do not ask for money directly.
Just state the forensic reality of your current moment.
`;

    return await this.query(prompt);
  }
}

module.exports = { YouComAgent };

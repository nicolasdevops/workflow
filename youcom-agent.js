/**
 * You.com Custom Agent API Integration
 * Handles comment matching and DM generation
 */

require('dotenv').config();

class YouComAgent {
  constructor(apiKey = null, agentId = null) {
    this.apiKey = apiKey || process.env.YOUCOM_API_KEY;
    this.agentId = agentId || process.env.YOUCOM_AGENT_ID;
    this.apiUrl = 'https://api.you.com/v1/agents/runs';
  }

  /**
   * Call the You.com agent with a prompt
   */
  async query(input) {
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
}

module.exports = { YouComAgent };

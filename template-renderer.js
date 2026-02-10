/**
 * Template Renderer Module
 *
 * Renders comment templates with family profile data.
 * Handles replacement fields like [AGE], [X], [OLDER], [NUMBER].
 *
 * Supports pipe syntax for explicit defaults: [AGE|5], [X|3], etc.
 * When no pipe default is provided, sensible fallbacks are used.
 */

// Default values when family data is missing (sensible fallbacks)
const FIELD_DEFAULTS = {
    AGE: 5,       // Middle childhood age
    OLDER: 10,    // Older child age
    YOUNGER: 2,   // Toddler age
    X: 3,         // Average family size
    NUMBER: 3,    // Same as X
    'X-1': 2,     // X minus 1
};

/**
 * Render a comment template with family profile data
 * @param {string} templateText - The template text with placeholders
 * @param {object} familyProfile - Family profile data from database
 * @returns {string} Rendered comment text
 */
function renderTemplate(templateText, familyProfile) {
    if (!templateText) return '';

    let text = templateText;

    // Get family data
    const childrenCount = familyProfile.children_count || 0;
    const childrenAges = parseChildrenAges(familyProfile.children_ages || []);
    const hasChildrenData = childrenCount > 0;
    const hasAgeData = childrenAges.length > 0;

    // Calculate derived values
    const oldestAge = hasAgeData ? Math.max(...childrenAges) : null;
    const youngestAge = hasAgeData ? Math.min(...childrenAges) : null;

    // First pass: Handle pipe syntax [FIELD|default] - explicit defaults override
    text = text.replace(/\[(\w+(?:-\d+)?)\|(\d+)\]/g, (match, field, explicitDefault) => {
        const defaultVal = parseInt(explicitDefault, 10);
        return resolveField(field, defaultVal, {
            childrenCount,
            childrenAges,
            hasChildrenData,
            hasAgeData,
            oldestAge,
            youngestAge,
        });
    });

    // Second pass: Handle standard syntax [FIELD] - uses sensible defaults
    // [X] - Children count
    text = text.replace(/\[X\]/g, () => {
        return hasChildrenData ? String(childrenCount) : String(FIELD_DEFAULTS.X);
    });

    // [X-1] - Children count minus 1
    text = text.replace(/\[X-1\]/g, () => {
        if (hasChildrenData) {
            return String(Math.max(0, childrenCount - 1));
        }
        return String(FIELD_DEFAULTS['X-1']);
    });

    // [NUMBER] - Same as children count
    text = text.replace(/\[NUMBER\]/g, () => {
        return hasChildrenData ? String(childrenCount) : String(FIELD_DEFAULTS.NUMBER);
    });

    // [AGE] - Random child's age (pick different ones for multiple occurrences)
    let ageIndex = 0;
    text = text.replace(/\[AGE\]/g, () => {
        if (!hasAgeData) return String(FIELD_DEFAULTS.AGE);
        const age = childrenAges[ageIndex % childrenAges.length];
        ageIndex++;
        return String(age);
    });

    // [OLDER] - Oldest child's age
    text = text.replace(/\[OLDER\]/g, () => {
        return hasAgeData ? String(oldestAge) : String(FIELD_DEFAULTS.OLDER);
    });

    // [YOUNGER] - Youngest child's age
    text = text.replace(/\[YOUNGER\]/g, () => {
        return hasAgeData ? String(youngestAge) : String(FIELD_DEFAULTS.YOUNGER);
    });

    return text;
}

/**
 * Resolve a field with an explicit default value (from pipe syntax)
 * @param {string} field - Field name (AGE, X, OLDER, etc.)
 * @param {number} explicitDefault - The default specified in [FIELD|default]
 * @param {object} data - Computed family data
 * @returns {string} Resolved value
 */
function resolveField(field, explicitDefault, data) {
    const { childrenCount, childrenAges, hasChildrenData, hasAgeData, oldestAge, youngestAge } = data;

    switch (field.toUpperCase()) {
        case 'AGE':
            return hasAgeData ? String(childrenAges[0]) : String(explicitDefault);
        case 'OLDER':
            return hasAgeData ? String(oldestAge) : String(explicitDefault);
        case 'YOUNGER':
            return hasAgeData ? String(youngestAge) : String(explicitDefault);
        case 'X':
        case 'NUMBER':
            return hasChildrenData ? String(childrenCount) : String(explicitDefault);
        case 'X-1':
            return hasChildrenData ? String(Math.max(0, childrenCount - 1)) : String(explicitDefault);
        default:
            return String(explicitDefault);
    }
}

/**
 * Parse children ages from various formats
 * @param {string|array} ages - Ages as array or comma-separated string
 * @returns {number[]} Array of ages as numbers
 */
function parseChildrenAges(ages) {
    if (!ages) return [];

    // If already an array
    if (Array.isArray(ages)) {
        return ages.map(a => parseInt(a, 10)).filter(a => !isNaN(a) && a > 0);
    }

    // If string (comma or space separated)
    if (typeof ages === 'string') {
        return ages
            .split(/[,\s]+/)
            .map(a => parseInt(a.trim(), 10))
            .filter(a => !isNaN(a) && a > 0);
    }

    return [];
}

/**
 * Check if a template can be rendered with given family data
 * @param {object} template - Template object with field_requirements
 * @param {object} familyProfile - Family profile data
 * @returns {boolean} True if template can be rendered
 */
function canRenderTemplate(template, familyProfile) {
    if (!template.has_fields) return true;
    if (!template.field_requirements) return true;

    const requirements = template.field_requirements;

    // Check children_count requirement
    if (requirements.children_count) {
        if (!familyProfile.children_count || familyProfile.children_count < 1) {
            return false;
        }
    }

    // Check children_ages requirement
    if (requirements.children_ages) {
        const ages = parseChildrenAges(familyProfile.children_ages);
        if (ages.length === 0) {
            return false;
        }
    }

    return true;
}

/**
 * Select a random template that hasn't been used on this post
 * @param {object} supabase - Supabase client
 * @param {string} postUrl - URL of the target post
 * @param {object} familyProfile - Family profile for checking compatibility
 * @returns {object|null} Selected template or null if none available
 */
async function selectUnusedTemplate(supabase, postUrl, familyProfile) {
    // Get templates already used on this post
    const { data: usedTemplates } = await supabase
        .from('posted_comments')
        .select('template_id')
        .eq('post_url', postUrl)
        .eq('status', 'posted');

    const usedIds = (usedTemplates || []).map(t => t.template_id);

    // Get all active templates not used on this post
    let query = supabase
        .from('comment_templates')
        .select('*')
        .eq('is_active', true);

    if (usedIds.length > 0) {
        query = query.not('id', 'in', `(${usedIds.join(',')})`);
    }

    const { data: availableTemplates, error } = await query;

    if (error || !availableTemplates || availableTemplates.length === 0) {
        console.log('[TemplateRenderer] No unused templates available for this post');
        return null;
    }

    // Filter to templates that can be rendered with this family's data
    const compatibleTemplates = availableTemplates.filter(t =>
        canRenderTemplate(t, familyProfile)
    );

    if (compatibleTemplates.length === 0) {
        console.log('[TemplateRenderer] No compatible templates for this family');
        return null;
    }

    // Prefer templates with lower usage count (balanced distribution)
    // Sort by usage_count ascending, then pick randomly from bottom 20%
    compatibleTemplates.sort((a, b) => a.usage_count - b.usage_count);

    const bottomPercentile = Math.max(1, Math.ceil(compatibleTemplates.length * 0.2));
    const candidates = compatibleTemplates.slice(0, bottomPercentile);

    // Random selection from candidates
    const selected = candidates[Math.floor(Math.random() * candidates.length)];

    console.log(`[TemplateRenderer] Selected template ${selected.id} (usage: ${selected.usage_count})`);
    return selected;
}

/**
 * Increment usage count for a template
 * @param {object} supabase - Supabase client
 * @param {number} templateId - Template ID
 */
async function incrementUsageCount(supabase, templateId) {
    await supabase.rpc('increment_template_usage', { template_id: templateId });
}

module.exports = {
    renderTemplate,
    parseChildrenAges,
    canRenderTemplate,
    selectUnusedTemplate,
    incrementUsageCount,
};

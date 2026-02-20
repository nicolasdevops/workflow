/**
 * Template Renderer Module v2
 *
 * Rich variable resolution engine for comment templates.
 * Syntax: {variable|default} — curly braces with optional pipe default.
 *
 * Variable categories:
 *   1. Family aggregates: {child_count}, {alive_count}, {deceased_count}, etc.
 *   2. Member-specific:   {child1:age|6}, {parent1:name}, {grand_child1:age}, {oldest_child:name}
 *   3. Numeric ranges:    {temp1|41.2}, {insulin_units|15}, {random[1-60]}, {fixed:29}
 *   4. Temporal:          {month}, {season}, {time_of_day}, {day_marker}
 *   5. Contextual:        {parent_role}, {shelter_type}, {location}, {religious_context}
 */

// Default numeric ranges (can be overridden per-family)
const NUMERIC_DEFAULTS = {
    insulin_units:    { min: 10, max: 20 },
    temp1:            { min: 40.5, max: 41.5, float: true },
    temp2:            { min: 40.8, max: 41.8, float: true },
    rice_grains:      { min: 15, max: 35 },
    bread_pieces:     { min: 1, max: 5 },
    water_bottles:    { min: 0, max: 3 },
    days_since:       { min: 30, max: 90 },
    hours:            { min: 1, max: 72 },
    minutes:          { min: 1, max: 60 },
    random_months:    { min: 1, max: 11 },
    displacement_count: { min: 3, max: 10, suffix: true }, // adds ordinal suffix
};

// Temporal options
const TEMPORAL = {
    time_of_day: ['morning', 'afternoon', 'evening', 'night'],
    day_marker:  ['Yesterday', 'Today', 'Last night', 'This morning'],
};

// Month/season mapping
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SEASON_MAP = {
    0: 'winter', 1: 'winter', 2: 'spring', 3: 'spring', 4: 'spring',
    5: 'summer', 6: 'summer', 7: 'summer', 8: 'fall', 9: 'fall', 10: 'fall', 11: 'winter',
};

/**
 * Derive pronoun and role from gender
 */
function deriveFromGender(gender) {
    const isMale = gender && gender.toLowerCase() === 'male';
    return {
        role_child: isMale ? 'son' : 'daughter',
        role_sibling: isMale ? 'brother' : 'sister',
        pronoun_sub: isMale ? 'He' : 'She',
        pronoun_obj: isMale ? 'him' : 'her',
        pronoun_poss: isMale ? 'his' : 'her',
    };
}

/**
 * Add ordinal suffix to a number (1st, 2nd, 3rd, 4th...)
 */
function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Random integer in [min, max] inclusive
 */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Random float in [min, max] with 1 decimal place
 */
function randFloat(min, max) {
    return (Math.random() * (max - min) + min).toFixed(1);
}

/**
 * Pick random element from array
 */
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build member lookup from children_details array.
 * Returns indexed members by role: child1/child2 (descendants), parent1/parent2 (father/mother),
 * grand_child1 (grandchildren), plus special refs (oldest_child, youngest_child, etc.)
 */
function buildMemberLookup(members) {
    if (!members || !Array.isArray(members) || members.length === 0) return {};

    const lookup = {};

    // Categorize members by relationship type
    // child1, child2... = descendants (son/daughter/child or unspecified)
    // parent1, parent2... = father/mother
    // grand_child1... = grandchild
    const counters = { child: 0, parent: 0, grand_child: 0 };
    const memberKeys = []; // track assigned key per member index

    members.forEach((m, i) => {
        const derived = deriveFromGender(m.gender);
        const rel = (m.relationship || '').toLowerCase();

        // Determine prefix based on relationship
        let prefix;
        if (rel === 'father' || rel === 'mother') {
            prefix = 'parent';
        } else if (rel === 'grandchild' || rel === 'grandson' || rel === 'granddaughter') {
            prefix = 'grand_child';
        } else {
            // Default: all other members are children (son, daughter, child, brother, sister, unspecified)
            prefix = 'child';
        }

        counters[prefix]++;
        const key = `${prefix}${counters[prefix]}`;
        memberKeys.push(key);

        let role = derived.role_child;
        if (rel === 'brother' || rel === 'sister' || rel === 'sibling') {
            role = derived.role_sibling;
        } else if (rel === 'mother' || rel === 'father' || rel === 'grandparent') {
            role = rel;
        }

        lookup[key] = {
            age: m.age || '',
            name: m.name || '',
            gender: m.gender || '',
            role: role,
            pronoun_sub: derived.pronoun_sub,
            pronoun_obj: derived.pronoun_obj,
            pronoun_poss: derived.pronoun_poss,
            status: m.status || 'Alive',
            days_since_death: m.days_deceased || '',
            medical_condition: m.medical_condition || '',
            mobility: m.mobility || '',
            physical_state: m.physical_state || '',
            medication_name: m.medication_name || '',
            cognitive: m.cognitive || '',
            disabled: m.disability === 'yes' ? 'yes' : 'no',
        };
    });

    // Special references — filter to children only (child prefix)
    const childEntries = members
        .map((m, i) => ({ ...m, _key: memberKeys[i] }))
        .filter((_m, i) => memberKeys[i].startsWith('child'));

    const alive = childEntries.filter(m => (m.status || 'Alive') === 'Alive');
    const deceased = childEntries.filter(m => (m.status || '') === 'Deceased');

    // Sort by age
    const byAgeDesc = (a, b) => (parseInt(b.age) || 0) - (parseInt(a.age) || 0);

    const sortedChildren = [...childEntries].sort(byAgeDesc);
    const sortedAlive = [...alive].sort(byAgeDesc);

    if (sortedChildren.length > 0) {
        lookup['oldest_child'] = lookup[sortedChildren[0]._key];
        lookup['youngest_child'] = lookup[sortedChildren[sortedChildren.length - 1]._key];
    }
    if (sortedAlive.length > 0) {
        lookup['oldest_alive'] = lookup[sortedAlive[0]._key];
        lookup['youngest_alive'] = lookup[sortedAlive[sortedAlive.length - 1]._key];
    }
    deceased.forEach((m, i) => {
        lookup[`deceased${i + 1}`] = lookup[m._key];
    });

    return lookup;
}

/**
 * Resolve a member-specific variable like {child1:age} or {oldest_child:pronoun_sub}
 */
function resolveMemberVar(ref, attr, fallback, memberLookup) {
    const member = memberLookup[ref];
    if (!member) return fallback || '';
    const val = member[attr];
    if (val === undefined || val === null || val === '') return fallback || '';
    return String(val);
}

/**
 * Resolve a numeric variable with override chain:
 *   family override > NUMERIC_DEFAULTS > pipe default
 */
function resolveNumeric(varName, pipeDefault, overrides, locks) {
    // Check locks first (exact value)
    if (locks && locks[varName] !== undefined) {
        return String(locks[varName]);
    }

    // Check overrides (custom range)
    const override = overrides && overrides[varName];
    const numDefault = NUMERIC_DEFAULTS[varName];

    let min, max, isFloat = false, addSuffix = false;

    if (override) {
        if (override.fixed !== undefined) return String(override.fixed);
        min = override.min;
        max = override.max;
        isFloat = override.float || (numDefault && numDefault.float) || false;
        addSuffix = override.suffix || (numDefault && numDefault.suffix) || false;
    } else if (numDefault) {
        min = numDefault.min;
        max = numDefault.max;
        isFloat = numDefault.float || false;
        addSuffix = numDefault.suffix || false;
    } else {
        // No known range — use pipe default ± 20%
        const base = parseFloat(pipeDefault) || 0;
        if (base === 0) return pipeDefault || '0';
        const isDecimal = String(pipeDefault).includes('.');
        min = Math.round(base * 0.8 * (isDecimal ? 10 : 1)) / (isDecimal ? 10 : 1);
        max = Math.round(base * 1.2 * (isDecimal ? 10 : 1)) / (isDecimal ? 10 : 1);
        isFloat = isDecimal;
    }

    const result = isFloat ? randFloat(min, max) : randInt(min, max);
    return addSuffix ? ordinal(Number(result)) : String(result);
}

/**
 * Main render function.
 *
 * @param {string} templateText - Template with {var|default} placeholders
 * @param {object} familyProfile - Full family profile from DB
 * @param {object} [config] - Per-family template config (overrides, locks, child_assignments)
 * @returns {{ text: string, variables: object }} Rendered text + snapshot of resolved variables
 */
function renderTemplate(templateText, familyProfile, config) {
    if (!templateText) return { text: '', variables: {} };

    const overrides = (config && config.template_overrides) || {};
    const locks = (config && config.variable_locks) || {};
    const childAssignments = (config && config.child_assignments) || {};

    const members = familyProfile.children_details || [];
    const memberLookup = buildMemberLookup(members);

    // Aggregate stats
    const allChildren = members.filter(m => {
        const rel = (m.relationship || '').toLowerCase();
        return !rel || rel === 'son' || rel === 'daughter' || rel === 'child';
    });
    const stats = {
        member_count: members.length,
        child_count: allChildren.length,
        alive_count: members.filter(m => (m.status || 'Alive') === 'Alive').length,
        deceased_count: members.filter(m => (m.status || '') === 'Deceased').length,
        disabled_count: members.filter(m => m.disability === 'yes').length,
    };

    // Contextual from profile
    const contextual = {
        parent_role: 'mama',
        shelter_type: familyProfile.housing_type || 'tent',
        location: familyProfile.gaza_zone || 'Gaza',
        religious_context: familyProfile.religion || 'Muslim',
        prayer_reference: (familyProfile.religion || '').toLowerCase() === 'christian' ? 'prayer' : 'dua',
        displacement_count: familyProfile.displacement_count || 5,
    };

    // Check if any parent is in members
    const parentMember = members.find(m => {
        const rel = (m.relationship || '').toLowerCase();
        return rel === 'father' || rel === 'mother';
    });
    if (parentMember) {
        const rel = (parentMember.relationship || '').toLowerCase();
        contextual.parent_role = rel === 'father' ? 'baba' : 'mama';
    }

    // Temporal
    const now = new Date();
    const temporal = {
        month: MONTHS[now.getMonth()],
        season: SEASON_MAP[now.getMonth()],
        time_of_day: pick(TEMPORAL.time_of_day),
        day_marker: pick(TEMPORAL.day_marker),
    };

    // Track resolved variables
    const resolved = {};

    // Main replacement pass
    let text = templateText;

    // Replace all {var|default} and {var} patterns
    text = text.replace(/\{([^}]+)\}/g, (match, expr) => {
        // Parse pipe default
        const parts = expr.split('|');
        const varExpr = parts[0].trim();
        const pipeDefault = parts.length > 1 ? parts.slice(1).join('|').trim() : '';

        let value;

        // 1. Check locks
        if (locks[varExpr] !== undefined) {
            value = String(locks[varExpr]);
            resolved[varExpr] = value;
            return value;
        }

        // 2. Fixed value syntax: {fixed:29}
        const fixedMatch = varExpr.match(/^fixed:(.+)$/);
        if (fixedMatch) {
            value = fixedMatch[1];
            resolved[varExpr] = value;
            return value;
        }

        // 3. Random range syntax: {random[min-max]}
        const randomMatch = varExpr.match(/^random\[(\d+)-(\d+)\]$/);
        if (randomMatch) {
            const rMin = parseInt(randomMatch[1]);
            const rMax = parseInt(randomMatch[2]);
            value = String(randInt(rMin, rMax));
            resolved[varExpr] = value;
            return value;
        }

        // 4. Random months: {random_months[min-max]}
        const randomMonthsMatch = varExpr.match(/^random_months\[(\d+)-(\d+)\]$/);
        if (randomMonthsMatch) {
            const rMin = parseInt(randomMonthsMatch[1]);
            const rMax = parseInt(randomMonthsMatch[2]);
            value = String(randInt(rMin, rMax));
            resolved[varExpr] = value;
            return value;
        }

        // 5. any_child[min-max]:attr syntax
        const anyChildMatch = varExpr.match(/^any_child\[(\d+)-(\d+)\]:(\w+)$/);
        if (anyChildMatch) {
            const ageMin = parseInt(anyChildMatch[1]);
            const ageMax = parseInt(anyChildMatch[2]);
            const attr = anyChildMatch[3];
            // Find children in age range from lookup (child-prefixed keys only)
            const childKeys = Object.keys(memberLookup).filter(k => /^child\d+$/.test(k));
            const candidates = childKeys.filter(k => {
                const age = parseInt(memberLookup[k].age);
                return !isNaN(age) && age >= ageMin && age <= ageMax;
            });
            if (candidates.length > 0) {
                const ref = pick(candidates);
                value = resolveMemberVar(ref, attr, pipeDefault, memberLookup);
            } else {
                value = pipeDefault;
            }
            resolved[varExpr] = value;
            return value;
        }

        // 6. Member-specific: {child1:attr} or {oldest_child:attr}
        const memberMatch = varExpr.match(/^(child\d+|parent\d+|grand_child\d+|oldest_child|youngest_child|oldest_alive|youngest_alive|deceased\d+):(\w+)$/);
        if (memberMatch) {
            let ref = memberMatch[1];
            const attr = memberMatch[2];

            // Apply child assignments (remap child1 → child3 etc.)
            if (childAssignments[ref] !== undefined) {
                ref = `child${childAssignments[ref] + 1}`;
            }

            value = resolveMemberVar(ref, attr, pipeDefault, memberLookup);
            resolved[`${memberMatch[1]}:${attr}`] = value;
            return value;
        }

        // 7. Aggregate stats: {child_count}, {alive_count}, etc.
        if (stats[varExpr] !== undefined) {
            value = String(stats[varExpr]);
            resolved[varExpr] = value;
            return value;
        }

        // 8. child_count-N pattern
        const countMinusMatch = varExpr.match(/^child_count-(\d+)$/);
        if (countMinusMatch) {
            const n = parseInt(countMinusMatch[1]);
            value = String(Math.max(0, stats.child_count - n));
            resolved[varExpr] = value;
            return value;
        }

        // 9. Temporal variables
        if (temporal[varExpr] !== undefined) {
            value = temporal[varExpr];
            resolved[varExpr] = value;
            return value;
        }

        // 10. Contextual variables
        if (contextual[varExpr] !== undefined) {
            const ctxVal = contextual[varExpr];
            // displacement_count gets special handling (ordinal)
            if (varExpr === 'displacement_count') {
                value = resolveNumeric(varExpr, pipeDefault || String(ctxVal), overrides, locks);
            } else {
                value = String(ctxVal);
            }
            resolved[varExpr] = value;
            return value;
        }

        // 11. Known numeric ranges
        if (NUMERIC_DEFAULTS[varExpr] || overrides[varExpr]) {
            value = resolveNumeric(varExpr, pipeDefault, overrides, locks);
            resolved[varExpr] = value;
            return value;
        }

        // 12. Unknown variable with numeric default — treat as numeric range
        if (pipeDefault && !isNaN(parseFloat(pipeDefault))) {
            value = resolveNumeric(varExpr, pipeDefault, overrides, locks);
            resolved[varExpr] = value;
            return value;
        }

        // 13. Fallback to pipe default or leave as-is
        value = pipeDefault || match;
        resolved[varExpr] = value;
        return value;
    });

    return { text, variables: resolved };
}

/**
 * Check if a template can be rendered with given family data.
 * Uses the full requirements object from templates.json.
 */
function canRenderTemplate(template, familyProfile) {
    const requirements = template.requirements || template.field_requirements;
    if (!requirements) return true;

    const members = familyProfile.children_details || [];
    const children = members.filter(m => {
        const rel = (m.relationship || '').toLowerCase();
        return !rel || rel === 'son' || rel === 'daughter' || rel === 'child';
    });

    // min_children
    if (requirements.min_children && children.length < requirements.min_children) {
        return false;
    }

    // needs_deceased_parent
    if (requirements.needs_deceased_parent) {
        const hasDeceasedParent = members.some(m => {
            const rel = (m.relationship || '').toLowerCase();
            return (rel === 'father' || rel === 'mother') && (m.status || '') === 'Deceased';
        });
        if (!hasDeceasedParent) return false;
    }

    // needs_medical
    if (requirements.needs_medical) {
        const hasMedical = members.some(m =>
            m.medical_condition && m.medical_condition !== '' && m.medical_condition !== 'none'
        );
        if (!hasMedical) return false;
    }

    // needs_disabled
    if (requirements.needs_disabled) {
        const hasDisabled = members.some(m => m.disability === 'yes');
        if (!hasDisabled) return false;
    }

    // age_constraints
    if (requirements.age_constraints) {
        for (const [ref, constraint] of Object.entries(requirements.age_constraints)) {
            const ageMin = constraint.min || 0;
            const ageMax = constraint.max || 100;

            // For special refs like oldest_child, youngest_child — check if matching member exists
            if (ref === 'oldest_child' || ref === 'youngest_child') {
                const ages = children.map(m => parseInt(m.age)).filter(a => !isNaN(a));
                if (ages.length === 0) return false;
                const targetAge = ref === 'oldest_child' ? Math.max(...ages) : Math.min(...ages);
                if (targetAge < ageMin || targetAge > ageMax) return false;
            } else {
                // childN — check if any child fits the constraint
                const fittingChild = children.find(m => {
                    const age = parseInt(m.age);
                    return !isNaN(age) && age >= ageMin && age <= ageMax;
                });
                if (!fittingChild) return false;
            }
        }
    }

    return true;
}

/**
 * Select an unused template from the database.
 * Checks eligibility against family data and avoids templates already used on the target post.
 */
async function selectUnusedTemplate(supabase, postUrl, familyProfile) {
    // Get templates already used on this post
    const { data: usedComments } = await supabase
        .from('family_generated_comments')
        .select('template_id')
        .eq('posted_to_url', postUrl)
        .eq('status', 'posted');

    const usedIds = (usedComments || []).map(t => t.template_id);

    // Get all active templates
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

    // Filter to templates compatible with this family
    const compatible = availableTemplates.filter(t => canRenderTemplate(t, familyProfile));

    if (compatible.length === 0) {
        console.log('[TemplateRenderer] No compatible templates for this family');
        return null;
    }

    // Prefer lower usage count (balanced distribution)
    compatible.sort((a, b) => (a.usage_count || 0) - (b.usage_count || 0));
    const bottomPercentile = Math.max(1, Math.ceil(compatible.length * 0.2));
    const candidates = compatible.slice(0, bottomPercentile);
    const selected = candidates[Math.floor(Math.random() * candidates.length)];

    console.log(`[TemplateRenderer] Selected template ${selected.template_id || selected.id} (usage: ${selected.usage_count || 0})`);
    return selected;
}

/**
 * Increment usage count for a template
 */
async function incrementUsageCount(supabase, templateId) {
    await supabase.rpc('increment_template_usage', { template_id: templateId });
}

module.exports = {
    renderTemplate,
    canRenderTemplate,
    selectUnusedTemplate,
    incrementUsageCount,
    buildMemberLookup,
    NUMERIC_DEFAULTS,
};

/**
 * Template Renderer Module v2
 *
 * Rich variable resolution engine for comment templates.
 * Syntax: {variable|default} — curly braces with optional pipe default.
 *
 * Variable categories:
 *   1. Family aggregates: {child_count}, {alive_count}, {deceased_count}, etc.
 *   2. Member-specific:   {child1:age|6}, {adult1:name}, {oldest_child:name}
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
 * Prefixes: child1/child2 (Son/Daughter or unspecified), adult1/adult2 (all others).
 * Convention: mother = adult1, father = adult2.
 * Dead members keep their child/adult prefix; deceased1/deceased2 are aliases.
 * Plus special refs: oldest_child, youngest_child, oldest_alive, youngest_alive.
 */
function buildMemberLookup(members, prefixOverrides) {
    if (!members || !Array.isArray(members) || members.length === 0) return {};

    const lookup = {};
    const overrides = prefixOverrides || {};

    // Determine auto-prefix: Son/Daughter or unspecified → child, everything else → adult
    // Status does NOT affect prefix (dead children stay child[x], dead adults stay adult[x])
    const autoCategories = members.map((m) => {
        const rel = (m.relationship || '').toLowerCase();
        const isChild = !rel || rel === 'son/daughter' || rel === 'son' || rel === 'daughter' || rel === 'child';
        return isChild ? 'child' : 'adult';
    });

    // Apply admin overrides: overrides = { "0": "child", "3": "adult" } (member index → prefix)
    const categories = autoCategories.map((auto, i) => overrides[String(i)] || auto);

    // Sort adults so mother comes first (adult1) and father second (adult2)
    // Build ordered index: group members by prefix, sort adults by gender convention
    const childIndices = [];
    const adultIndices = [];
    members.forEach((m, i) => {
        if (categories[i] === 'child') childIndices.push(i);
        else adultIndices.push(i);
    });

    // Sort adults: females first (mother=adult1), males second (father=adult2)
    adultIndices.sort((a, b) => {
        const gA = (members[a].gender || '').toLowerCase();
        const gB = (members[b].gender || '').toLowerCase();
        if (gA === 'female' && gB !== 'female') return -1;
        if (gA !== 'female' && gB === 'female') return 1;
        return 0;
    });

    // Assign numbered keys
    const memberKeys = new Array(members.length);
    childIndices.forEach((idx, n) => { memberKeys[idx] = `child${n + 1}`; });
    adultIndices.forEach((idx, n) => { memberKeys[idx] = `adult${n + 1}`; });

    members.forEach((m, i) => {
        const derived = deriveFromGender(m.gender);
        const rel = (m.relationship || '').toLowerCase();
        const key = memberKeys[i];

        let role = derived.role_child;
        if (rel === 'brother' || rel === 'sister' || rel === 'sibling' || rel === 'brother/sister') {
            role = derived.role_sibling;
        } else if (rel === 'mother' || rel === 'father' || rel === 'mother/father') {
            role = m.gender === 'Male' ? 'father' : 'mother';
        } else if (rel === 'husband' || rel === 'wife' || rel === 'husband/wife') {
            role = m.gender === 'Male' ? 'husband' : 'wife';
        } else if (rel === 'nephew' || rel === 'niece' || rel === 'nephew/niece') {
            role = m.gender === 'Male' ? 'nephew' : 'niece';
        } else if (rel === 'aunt' || rel === 'uncle' || rel === 'aunt/uncle') {
            role = m.gender === 'Male' ? 'uncle' : 'aunt';
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

    // Deceased aliases: deceased1, deceased2... → point to whichever child/adult is deceased
    let deceasedCount = 0;
    members.forEach((m, i) => {
        if ((m.status || '') === 'Deceased') {
            deceasedCount++;
            lookup[`deceased${deceasedCount}`] = lookup[memberKeys[i]];
        }
    });

    // Special references — oldest/youngest from child-prefixed entries only
    const childEntries = members
        .map((m, i) => ({ ...m, _key: memberKeys[i] }))
        .filter((_m, i) => memberKeys[i].startsWith('child'));

    const alive = childEntries.filter(m => (m.status || 'Alive') === 'Alive');

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
    const prefixOverrides = (config && config.member_prefix_overrides) || {};

    const members = familyProfile.children_details || [];
    const memberLookup = buildMemberLookup(members, prefixOverrides);

    // Aggregate stats
    const allChildren = members.filter(m => {
        const rel = (m.relationship || '').toLowerCase();
        return !rel || rel === 'son/daughter' || rel === 'son' || rel === 'daughter' || rel === 'child';
    });
    const stats = {
        member_count: members.length,
        child_count: allChildren.length,
        alive_count: members.filter(m => (m.status || 'Alive') === 'Alive').length,
        deceased_count: members.filter(m => (m.status || '') === 'Deceased').length,
        disabled_count: members.filter(m => m.disability === 'yes').length,
    };

    // Contextual from profile
    const familySize = members.length; // all family members (narrator is typically listed as adult1)
    const contextual = {
        parent_role: 'mama',
        shelter_type: familyProfile.housing_type || 'tent',
        location: familyProfile.gaza_zone || 'Gaza',
        religious_context: familyProfile.religion || 'Muslim',
        prayer_reference: (familyProfile.religion || '').toLowerCase() === 'christian' ? 'prayer' : 'dua',
        displacement_count: familyProfile.displacement_count || 5,
        family_size: familySize,
        christians_left: '300',
        christians_lost: '300',
    };

    // Check if any parent is in members
    const parentMember = members.find(m => {
        const rel = (m.relationship || '').toLowerCase();
        return rel === 'father' || rel === 'mother' || rel === 'mother/father';
    });
    if (parentMember) {
        contextual.parent_role = parentMember.gender === 'Male' ? 'baba' : 'mama';
    }

    // Temporal
    const now = new Date();
    const temporal = {
        month: MONTHS[now.getMonth()],
        season: SEASON_MAP[now.getMonth()],
        time_of_day: pick(TEMPORAL.time_of_day),
        day_marker: pick(TEMPORAL.day_marker),
    };

    // Track resolved variables + dedup cache for var1:type syntax
    const resolved = {};
    const dedupCache = {};

    /**
     * Inner resolver: resolves a variable expression (without dedup wrapper).
     * Returns the resolved string value.
     */
    function resolveVar(varExpr, pipeDefault) {
        let value;

        // 1. Check locks
        if (locks[varExpr] !== undefined) {
            return String(locks[varExpr]);
        }

        // 2. Fixed value syntax: {fixed:29}
        const fixedMatch = varExpr.match(/^fixed:(.+)$/);
        if (fixedMatch) return fixedMatch[1];

        // 3. Random range syntax: {random[min-max]}
        const randomMatch = varExpr.match(/^random\[(\d+)-(\d+)\]$/);
        if (randomMatch) {
            return String(randInt(parseInt(randomMatch[1]), parseInt(randomMatch[2])));
        }

        // 4. Random months: {random_months[min-max]}
        const randomMonthsMatch = varExpr.match(/^random_months\[(\d+)-(\d+)\]$/);
        if (randomMonthsMatch) {
            return String(randInt(parseInt(randomMonthsMatch[1]), parseInt(randomMonthsMatch[2])));
        }

        // 5. any_child[min-max]:attr syntax
        const anyChildMatch = varExpr.match(/^any_child\[(\d+)-(\d+)\]:(\w+)$/);
        if (anyChildMatch) {
            const ageMin = parseInt(anyChildMatch[1]);
            const ageMax = parseInt(anyChildMatch[2]);
            const attr = anyChildMatch[3];
            const childKeys = Object.keys(memberLookup).filter(k => /^child\d+$/.test(k));
            const candidates = childKeys.filter(k => {
                const age = parseInt(memberLookup[k].age);
                return !isNaN(age) && age >= ageMin && age <= ageMax;
            });
            if (candidates.length > 0) {
                return resolveMemberVar(pick(candidates), attr, pipeDefault, memberLookup);
            }
            return pipeDefault || '';
        }

        // 6. Member-specific with inline age constraint: {child1:age[3-6]|4} or {child2:age[6-9,>child1:age]|7}
        const memberConstraintMatch = varExpr.match(/^(child\d+|adult\d+|oldest_child|youngest_child|oldest_alive|youngest_alive|deceased\d+):(\w+)\[([^\]]+)\]$/);
        if (memberConstraintMatch) {
            let ref = memberConstraintMatch[1];
            const attr = memberConstraintMatch[2];
            const constraintStr = memberConstraintMatch[3];

            if (childAssignments[ref] !== undefined) {
                ref = `child${childAssignments[ref] + 1}`;
            }

            // Parse constraint: "3-6" or "6-9,>child1:age" or "6-9,<child1:age"
            let rangeMin = 0, rangeMax = 100;
            let relOp = null, relRef = null, relAttr = null;
            const constraintParts = constraintStr.split(',');
            for (const part of constraintParts) {
                const rangeMatch = part.trim().match(/^(\d+)-(\d+)$/);
                if (rangeMatch) {
                    rangeMin = parseInt(rangeMatch[1]);
                    rangeMax = parseInt(rangeMatch[2]);
                } else {
                    const relMatch = part.trim().match(/^([<>])(.+):(\w+)$/);
                    if (relMatch) {
                        relOp = relMatch[1];
                        relRef = relMatch[2];
                        relAttr = relMatch[3];
                    }
                }
            }

            // Get the member's actual value
            const member = memberLookup[ref];
            if (member && member[attr] !== undefined && member[attr] !== '') {
                const actualVal = parseInt(member[attr]);
                if (!isNaN(actualVal) && actualVal >= rangeMin && actualVal <= rangeMax) {
                    // Check relative constraint
                    if (relOp && relRef && relAttr) {
                        const relVal = parseInt(resolveMemberVar(relRef, relAttr, '0', memberLookup));
                        if (relOp === '>' && actualVal <= relVal) {
                            return String(randInt(Math.max(rangeMin, relVal + 1), rangeMax)) || pipeDefault || '';
                        }
                        if (relOp === '<' && actualVal >= relVal) {
                            return String(randInt(rangeMin, Math.min(rangeMax, relVal - 1))) || pipeDefault || '';
                        }
                    }
                    return String(actualVal);
                }
            }
            // No valid member data — generate random in range respecting relative constraint
            let effMin = rangeMin, effMax = rangeMax;
            if (relOp && relRef && relAttr) {
                const relVal = parseInt(resolved[`${relRef}:${relAttr}`] || resolveMemberVar(relRef, relAttr, '0', memberLookup));
                if (!isNaN(relVal)) {
                    if (relOp === '>') effMin = Math.max(effMin, relVal + 1);
                    if (relOp === '<') effMax = Math.min(effMax, relVal - 1);
                }
            }
            if (effMin > effMax) return pipeDefault || String(rangeMin);
            return String(randInt(effMin, effMax));
        }

        // 7. Member-specific: {child1:attr} or {oldest_child:attr}
        const memberMatch = varExpr.match(/^(child\d+|adult\d+|oldest_child|youngest_child|oldest_alive|youngest_alive|deceased\d+):(\w+)$/);
        if (memberMatch) {
            let ref = memberMatch[1];
            const attr = memberMatch[2];
            if (childAssignments[ref] !== undefined) {
                ref = `child${childAssignments[ref] + 1}`;
            }
            return resolveMemberVar(ref, attr, pipeDefault, memberLookup);
        }

        // 8. Aggregate stats: {child_count}, {alive_count}, etc.
        if (stats[varExpr] !== undefined) return String(stats[varExpr]);

        // 9. child_count-N or var-N arithmetic pattern
        const countMinusMatch = varExpr.match(/^(\w+)-(\d+)$/);
        if (countMinusMatch) {
            const baseVar = countMinusMatch[1];
            const n = parseInt(countMinusMatch[2]);
            // Check stats first, then resolved dedup cache, then contextual
            let baseVal = stats[baseVar] !== undefined ? stats[baseVar] :
                          dedupCache[baseVar] !== undefined ? parseInt(dedupCache[baseVar]) :
                          contextual[baseVar] !== undefined ? parseInt(contextual[baseVar]) : NaN;
            if (!isNaN(baseVal)) return String(Math.max(0, baseVal - n));
            return pipeDefault || '';
        }

        // 10. Temporal variables
        if (temporal[varExpr] !== undefined) return temporal[varExpr];

        // 11. Contextual variables
        if (contextual[varExpr] !== undefined) {
            const ctxVal = contextual[varExpr];
            if (varExpr === 'displacement_count') {
                return resolveNumeric(varExpr, pipeDefault || String(ctxVal), overrides, locks);
            }
            return String(ctxVal);
        }

        // 12. Known numeric ranges
        if (NUMERIC_DEFAULTS[varExpr] || overrides[varExpr]) {
            return resolveNumeric(varExpr, pipeDefault, overrides, locks);
        }

        // 13. Unknown variable with numeric default — treat as numeric range
        if (pipeDefault && !isNaN(parseFloat(pipeDefault))) {
            return resolveNumeric(varExpr, pipeDefault, overrides, locks);
        }

        // 14. Fallback to pipe default or leave as-is
        return pipeDefault || '';
    }

    // Main replacement pass
    let text = templateText;

    // Replace all {var|default} and {var} patterns
    text = text.replace(/\{([^}]+)\}/g, (match, expr) => {
        // Parse pipe default
        const parts = expr.split('|');
        const varExpr = parts[0].trim();
        const pipeDefault = parts.length > 1 ? parts.slice(1).join('|').trim() : '';

        let value;

        // Handle var1:type dedup syntax — {var1:month|October}, {var1:christians_left|300}
        const dedupMatch = varExpr.match(/^(var\d+):(.+)$/);
        if (dedupMatch) {
            const dedupKey = dedupMatch[1] + ':' + dedupMatch[2]; // e.g. "var1:month"
            const innerVar = dedupMatch[2]; // e.g. "month" or "christians_left" or "church_count-1"

            // If already resolved this dedup key, reuse
            if (dedupCache[dedupKey] !== undefined) {
                value = dedupCache[dedupKey];
            } else {
                // Resolve the inner variable
                value = resolveVar(innerVar, pipeDefault);
                dedupCache[dedupKey] = value;
                // Also cache the base variable name for arithmetic references
                const baseMatch = innerVar.match(/^(\w+)$/);
                if (baseMatch) dedupCache[innerVar] = value;
            }
            resolved[dedupKey] = value;
            return value;
        }

        // Standard resolution
        value = resolveVar(varExpr, pipeDefault);
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

    // needs_daughter — at least one female child
    if (requirements.needs_daughter) {
        const hasDaughter = children.some(m => (m.gender || '').toLowerCase() === 'female');
        if (!hasDaughter) return false;
    }

    // needs_daughters — need N female children
    if (requirements.needs_daughters) {
        const daughterCount = children.filter(m => (m.gender || '').toLowerCase() === 'female').length;
        if (daughterCount < requirements.needs_daughters) return false;
    }

    // needs_gender_mix — need both male and female children
    if (requirements.needs_gender_mix) {
        const hasMale = children.some(m => (m.gender || '').toLowerCase() === 'male');
        const hasFemale = children.some(m => (m.gender || '').toLowerCase() === 'female');
        if (!hasMale || !hasFemale) return false;
    }

    // needs_baby — need a child aged 0-2
    if (requirements.needs_baby) {
        const hasBaby = children.some(m => {
            const age = parseInt(m.age);
            return !isNaN(age) && age <= 2;
        });
        if (!hasBaby) return false;
    }

    // needs_deceased_father — father member with status Deceased
    if (requirements.needs_deceased_father) {
        const hasDeceasedFather = members.some(m => {
            const rel = (m.relationship || '').toLowerCase();
            return (rel === 'father' || rel === 'mother/father' || rel === 'husband/wife') &&
                   (m.gender || '').toLowerCase() === 'male' && (m.status || '') === 'Deceased';
        });
        if (!hasDeceasedFather) return false;
    }

    // needs_deceased_child — a child member with status Deceased
    if (requirements.needs_deceased_child) {
        const hasDeceasedChild = children.some(m => (m.status || '') === 'Deceased');
        if (!hasDeceasedChild) return false;
    }

    // needs_medical_condition — specific condition (e.g. "diabetes", "heart")
    if (requirements.needs_medical_condition) {
        const condition = requirements.needs_medical_condition.toLowerCase();
        const hasCondition = members.some(m =>
            m.medical_condition && m.medical_condition.toLowerCase().includes(condition)
        );
        if (!hasCondition) return false;
    }

    // adult2_status — check father/adult2 status (e.g. "deceased")
    if (requirements.adult2_status) {
        const father = members.find(m => {
            const rel = (m.relationship || '').toLowerCase();
            return (rel === 'father' || rel === 'mother/father' || rel === 'husband/wife') &&
                   (m.gender || '').toLowerCase() === 'male';
        });
        if (!father || (father.status || '').toLowerCase() !== requirements.adult2_status.toLowerCase()) return false;
    }

    // religious_context — family religion must match
    if (requirements.religious_context) {
        const familyReligion = (familyProfile.religion || '').toLowerCase();
        if (familyReligion !== requirements.religious_context.toLowerCase()) return false;
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

-- Families table
CREATE TABLE families (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    instagram_handle VARCHAR(50) UNIQUE,
    api_key VARCHAR(64) UNIQUE,
    children_count INT,
    children_ages TEXT[],
    children_genders TEXT[],
    housing_type VARCHAR(20),
    medical_conditions TEXT[],
    facing_cold BOOLEAN DEFAULT true,
    facing_hunger BOOLEAN DEFAULT true,
    displacement_count INT DEFAULT 1,
    allowed_testimonies INT[] DEFAULT ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],
    last_comment_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Comments deployed tracking
CREATE TABLE comments_deployed (
    id SERIAL PRIMARY KEY,
    family_id INT REFERENCES families(id),
    target_post_url TEXT,
    target_account VARCHAR(100),
    comment_number INT,
    comment_text TEXT,
    posted_at TIMESTAMP DEFAULT NOW(),
    engagement_count INT DEFAULT 0,
    UNIQUE(target_post_url, family_id)
);

-- Target posts to comment on
CREATE TABLE target_posts (
    id SERIAL PRIMARY KEY,
    account_handle VARCHAR(100),
    post_url TEXT UNIQUE,
    caption TEXT,
    discovered_at TIMESTAMP DEFAULT NOW(),
    slots_used INT DEFAULT 0,
    max_slots INT DEFAULT 2,
    theme VARCHAR(50)
);

-- Task assignments
CREATE TABLE comment_assignments (
    id SERIAL PRIMARY KEY,
    family_id INT REFERENCES families(id),
    post_id INT REFERENCES target_posts(id),
    comment_number INT,
    assigned_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    UNIQUE(post_id, family_id)
);

### automation_overview
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | YES |
| name | character varying | YES |
| original_account | character varying | YES |
| synthetic_account | text | YES |
| ig_account_status | text | YES |
| bestbehavior_enabled | boolean | YES |
| commenting_enabled | boolean | YES |
| contentposting_enabled | boolean | YES |
| dm_enabled | boolean | YES |
| primary_mode | text | YES |

### comment_assignments
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| family_id | integer | YES |
| post_id | integer | YES |
| comment_number | integer | YES |
| assigned_at | timestamp without time zone | YES |
| completed_at | timestamp without time zone | YES |
| status | character varying | YES |

### comment_schedule
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| day_of_week | integer | NO |
| time_slot | time without time zone | NO |
| timezone | text | YES |
| is_active | boolean | YES |

### comment_templates
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| template_text | text | NO |
| has_fields | boolean | YES |
| field_requirements | jsonb | YES |
| usage_count | integer | YES |
| is_active | boolean | YES |
| created_at | timestamp without time zone | YES |

### comments_deployed
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| family_id | integer | YES |
| target_post_url | text | YES |
| target_account | character varying | YES |
| comment_number | integer | YES |
| comment_text | text | YES |
| posted_at | timestamp without time zone | YES |
| engagement_count | integer | YES |

### engaged_followers
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| family_id | integer | YES |
| username | character varying | NO |
| full_name | text | YES |
| profile_pic_url | text | YES |
| engagement_type | character varying | NO |
| post_shortcode | text | YES |
| engagement_count | integer | YES |
| first_seen_at | timestamp without time zone | YES |
| last_seen_at | timestamp without time zone | YES |

### engaged_followers_summary
| Column | Type | Nullable |
| --- | --- | --- |
| family_id | integer | YES |
| family_name | character varying | YES |
| instagram_handle | character varying | YES |
| total_engaged_followers | bigint | YES |
| likers_count | bigint | YES |
| commenters_count | bigint | YES |
| most_recent_engagement | timestamp without time zone | YES |
| last_followers_backup_at | timestamp without time zone | YES |

### engagement_quality_report
| Column | Type | Nullable |
| --- | --- | --- |
| target_account_id | integer | YES |
| handle | character varying | YES |
| category | character varying | YES |
| followers_count | integer | YES |
| quality_score | numeric | YES |
| total_comments | bigint | YES |
| total_likes | bigint | YES |
| total_replies | bigint | YES |
| avg_likes_per_comment | numeric | YES |
| last_post_checked_at | timestamp without time zone | YES |

### families
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| name | character varying | YES |
| instagram_handle | character varying | YES |
| api_key | character varying | YES |
| children_count | integer | YES |
| children_ages | ARRAY | YES |
| children_genders | ARRAY | YES |
| housing_type | character varying | YES |
| medical_conditions | ARRAY | YES |
| facing_cold | boolean | YES |
| facing_hunger | boolean | YES |
| displacement_count | integer | YES |
| allowed_testimonies | ARRAY | YES |
| last_comment_at | timestamp without time zone | YES |
| created_at | timestamp without time zone | YES |
| password | text | YES |
| email | text | YES |
| status | text | YES |
| cookies | text | YES |
| last_login | timestamp with time zone | YES |
| profile_pic_url | text | YES |
| reset_token | text | YES |
| reset_expires | timestamp with time zone | YES |
| children_details | jsonb | YES |
| urgent_need | text | YES |
| urgent_need_amount | text | YES |
| urgent_needs | jsonb | YES |
| proxy_city | text | YES |
| proxy_country | text | YES |
| timezone | text | YES |
| geo_latitude | numeric | YES |
| geo_longitude | numeric | YES |
| ig_email | text | YES |
| ig_email_password | text | YES |
| ig_username | text | YES |
| ig_password | text | YES |
| ig_phone_number | text | YES |
| ig_account_created_at | timestamp without time zone | YES |
| ig_account_status | text | YES |
| last_warmup_at | timestamp without time zone | YES |
| warmup_day | integer | YES |
| bestbehavior_enabled | boolean | YES |
| commenting_enabled | boolean | YES |
| contentposting_enabled | boolean | YES |
| dm_enabled | boolean | YES |
| ig_profile_scraped | boolean | YES |
| palpay_phone | text | YES |
| palpay_name | text | YES |
| last_followers_backup_at | timestamp without time zone | YES |

### family_members
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| family_id | integer | YES |
| name | character varying | NO |
| role | character varying | NO |
| age | integer | YES |
| gender | character varying | YES |
| description | text | YES |
| reference_photo_url | text | YES |
| is_primary | boolean | YES |
| display_order | integer | YES |
| created_at | timestamp without time zone | YES |
| updated_at | timestamp without time zone | YES |

### family_with_members
| Column | Type | Nullable |
| --- | --- | --- |
| family_id | integer | YES |
| family_name | character varying | YES |
| instagram_handle | character varying | YES |
| member_id | integer | YES |
| member_name | character varying | YES |
| role | character varying | YES |
| age | integer | YES |
| gender | character varying | YES |
| description | text | YES |
| reference_photo_url | text | YES |
| is_primary | boolean | YES |

### media_uploads
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| family_id | integer | YES |
| file_path | text | NO |
| description | text | YES |
| created_at | timestamp with time zone | NO |
| b2_url | text | YES |

### mothers_content
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| family_id | integer | YES |
| instagram_id | text | YES |
| short_code | text | NO |
| content_type | text | YES |
| caption | text | YES |
| display_url | text | YES |
| video_url | text | YES |
| likes_count | integer | YES |
| comments_count | integer | YES |
| posted_at | timestamp without time zone | YES |
| location_name | text | YES |
| hashtags | jsonb | YES |
| mentions | jsonb | YES |
| is_video | boolean | YES |
| scraped_at | timestamp without time zone | YES |
| created_at | timestamp without time zone | YES |
| description | text | YES |

### mothers_profiles
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| family_id | integer | YES |
| instagram_username | text | NO |
| full_name | text | YES |
| biography | text | YES |
| profile_pic_url | text | YES |
| followers_count | integer | YES |
| following_count | integer | YES |
| posts_count | integer | YES |
| is_verified | boolean | YES |
| external_url | text | YES |
| fundraiser_links | jsonb | YES |
| last_scraped_at | timestamp without time zone | YES |
| created_at | timestamp without time zone | YES |
| updated_at | timestamp without time zone | YES |

### posted_comments
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| family_id | integer | YES |
| target_account_id | integer | YES |
| template_id | integer | YES |
| post_url | text | NO |
| post_shortcode | text | YES |
| rendered_comment | text | NO |
| posted_at | timestamp without time zone | YES |
| likes_count | integer | YES |
| replies_count | integer | YES |
| last_engagement_check | timestamp without time zone | YES |
| status | character varying | YES |
| error_message | text | YES |
| created_at | timestamp without time zone | YES |

### profile_scrape_status
| Column | Type | Nullable |
| --- | --- | --- |
| family_id | integer | YES |
| family_name | character varying | YES |
| original_account | character varying | YES |
| ig_profile_scraped | boolean | YES |
| scraped_name | text | YES |
| followers_count | integer | YES |
| posts_count | integer | YES |
| last_scraped_at | timestamp without time zone | YES |
| scrape_status | text | YES |
| hours_since_scrape | numeric | YES |
| fundraiser_links_count | integer | YES |
| content_count | bigint | YES |

### proxy_cities
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| city_name | text | NO |
| city_key | text | NO |
| country_code | text | NO |
| timezone | text | NO |
| latitude | numeric | NO |
| longitude | numeric | NO |
| network_provider | text | YES |
| rotation_order | integer | NO |

### target_accounts
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| handle | character varying | NO |
| followers_count | integer | YES |
| category | character varying | YES |
| language | character varying | YES |
| quality_score | numeric | YES |
| total_comments_posted | integer | YES |
| total_likes_on_comments | integer | YES |
| is_active | boolean | YES |
| last_post_url | text | YES |
| last_post_checked_at | timestamp without time zone | YES |
| created_at | timestamp without time zone | YES |

### target_posts
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | NO |
| account_handle | character varying | YES |
| post_url | text | YES |
| caption | text | YES |
| discovered_at | timestamp without time zone | YES |
| slots_used | integer | YES |
| max_slots | integer | YES |
| theme | character varying | YES |

### warmup_status
| Column | Type | Nullable |
| --- | --- | --- |
| id | integer | YES |
| name | character varying | YES |
| ig_username | text | YES |
| ig_account_status | text | YES |
| ig_account_created_at | timestamp without time zone | YES |
| last_warmup_at | timestamp without time zone | YES |
| warmup_day | integer | YES |
| calculated_day | numeric | YES |
| current_phase | text | YES |
| days_remaining | numeric | YES |
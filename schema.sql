users 테이블

SQL

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    firebase_uid VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    real_name VARCHAR(100) NOT NULL,
    nickname VARCHAR(100) UNIQUE NOT NULL,
    profile_image_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
missing_persons 테이블

SQL

CREATE TABLE missing_persons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT NOT NULL,
    missing_person_name VARCHAR(255) NOT NULL,
    gender VARCHAR(10),
    age_at_missing INT,
    height INT,
    weight INT,
    last_seen_at DATETIME NOT NULL,
    last_seen_location VARCHAR(255) NOT NULL,
    description TEXT,
    main_photo_url VARCHAR(255),
    status ENUM('missing', 'found', 'resolved') DEFAULT 'missing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(id)
);
missing_animals 테이블

SQL

CREATE TABLE missing_animals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    animal_type VARCHAR(50) NOT NULL,
    breed VARCHAR(100),
    animal_name VARCHAR(255),
    gender VARCHAR(10),
    age INT,
    last_seen_at DATETIME NOT NULL,
    last_seen_location VARCHAR(255) NOT NULL,
    description TEXT,
    main_photo_url VARCHAR(255),
    status ENUM('missing', 'found', 'resolved') DEFAULT 'missing',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);
person_sightings 테이블

SQL

CREATE TABLE person_sightings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    missing_person_id INT NOT NULL,
    reporter_id INT NOT NULL,
    sighting_at DATETIME NOT NULL,
    sighting_location VARCHAR(255) NOT NULL,
    description TEXT,
    sighting_photo_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (missing_person_id) REFERENCES missing_persons(id),
    FOREIGN KEY (reporter_id) REFERENCES users(id)
);
animal_sightings 테이블

SQL

CREATE TABLE animal_sightings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    missing_animal_id INT NOT NULL,
    reporter_id INT NOT NULL,
    sighting_at DATETIME NOT NULL,
    sighting_location VARCHAR(255) NOT NULL,
    description TEXT,
    sighting_photo_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (missing_animal_id) REFERENCES missing_animals(id),
    FOREIGN KEY (reporter_id) REFERENCES users(id)
);

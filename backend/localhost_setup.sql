-- Add localhost configuration for running Ansible tasks locally
-- This script should be run after the main database tables are created

-- Insert localhost host
INSERT INTO hosts (id, name, hostname, description, os_type, port, created_at, updated_at) 
VALUES (
    gen_random_uuid()::text,
    'localhost',
    'localhost',
    'Local container for running Ansible tasks within the backend container',
    'linux',
    22,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (hostname) DO NOTHING;

-- Insert localhost credential
INSERT INTO credentials (id, name, username, password, description, is_default, created_at, updated_at) 
VALUES (
    gen_random_uuid()::text,
    'Localhost SSH',
    'ansible',
    'ansible',
    'SSH credentials for localhost access within the container',
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- Create a sample localhost playbook
INSERT INTO playbooks (id, name, content, description, created_at, updated_at)
VALUES (
    gen_random_uuid()::text,
    'localhost-test',
    '---
- name: Test localhost connectivity
  hosts: all
  become: yes
  tasks:
    - name: Get system information
      setup:
      register: system_info
    
    - name: Display hostname
      debug:
        msg: "Running on {{ ansible_hostname }}"
    
    - name: Check disk space
      shell: df -h /
      register: disk_space
    
    - name: Display disk space
      debug:
        msg: "Disk space: {{ disk_space.stdout }}"
    
    - name: Create test file
      file:
        path: /tmp/ansible_test.txt
        state: touch
        mode: "0644"
    
    - name: Write to test file
      lineinfile:
        path: /tmp/ansible_test.txt
        line: "Ansible localhost test completed at {{ ansible_date_time.iso8601 }}"
        create: yes',
    'Test playbook for localhost connectivity and basic operations',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (name) DO NOTHING;
import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Space,
  Typography,
  Tag
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  BookOutlined,
  CodeOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { playbooksAPI } from '../services/api';
import moment from 'moment';

const { Title } = Typography;
const { TextArea } = Input;

const Playbooks = () => {
  const [playbooks, setPlaybooks] = useState([]);
  const [filteredPlaybooks, setFilteredPlaybooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    fetchPlaybooks();
  }, []);

  const fetchPlaybooks = async () => {
    setLoading(true);
    try {
      const response = await playbooksAPI.getAll();
      setPlaybooks(response.data);
      setFilteredPlaybooks(response.data);
    } catch (error) {
      message.error('Failed to fetch playbooks');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value) => {
    setSearchText(value);
    if (!value) {
      setFilteredPlaybooks(playbooks);
    } else {
      const filtered = playbooks.filter(playbook =>
        playbook.name.toLowerCase().includes(value.toLowerCase()) ||
        (playbook.description && playbook.description.toLowerCase().includes(value.toLowerCase()))
      );
      setFilteredPlaybooks(filtered);
    }
  };

  const handleCreate = () => {
    setEditingPlaybook(null);
    form.resetFields();
    form.setFieldsValue({
      content: `---
- name: Sample playbook
  hosts: all
  become: yes
  tasks:
    - name: Update system packages
      apt:
        update_cache: yes
      when: ansible_os_family == "Debian"
    
    - name: Install essential packages
      package:
        name:
          - curl
          - wget
          - vim
        state: present`
    });
    setModalVisible(true);
  };

  const handleEdit = (playbook) => {
    setEditingPlaybook(playbook);
    form.setFieldsValue(playbook);
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await playbooksAPI.delete(id);
      message.success('Playbook deleted successfully');
      fetchPlaybooks();
    } catch (error) {
      message.error('Failed to delete playbook');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingPlaybook) {
        await playbooksAPI.update(editingPlaybook.id, values);
        message.success('Playbook updated successfully');
      } else {
        await playbooksAPI.create(values);
        message.success('Playbook created successfully');
      }
      setModalVisible(false);
      fetchPlaybooks();
    } catch (error) {
      message.error(`Failed to ${editingPlaybook ? 'update' : 'create'} playbook`);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text) => (
        <Space>
          <BookOutlined style={{ color: '#1890ff' }} />
          <strong>{text}</strong>
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => moment(date).format('MMM DD, YYYY HH:mm'),
      width: 180,
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (date) => moment(date).format('MMM DD, YYYY HH:mm'),
      width: 180,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            title="Edit"
          />
          <Popconfirm
            title="Are you sure you want to delete this playbook?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              title="Delete"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <BookOutlined />
            <Title level={4} style={{ margin: 0 }}>Ansible Playbooks</Title>
          </Space>
        }
        extra={
          <Space>
            <Input.Search
              placeholder="Search playbooks..."
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 250 }}
              allowClear
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              New Playbook
            </Button>
          </Space>
        }
        className="card-container"
      >
        <Table
          columns={columns}
          dataSource={filteredPlaybooks}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} playbooks`,
          }}
        />
      </Card>

      <Modal
        title={
          <Space>
            <CodeOutlined />
            {editingPlaybook ? 'Edit Playbook' : 'Create New Playbook'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={800}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            label="Playbook Name"
            name="name"
            rules={[
              { required: true, message: 'Please enter playbook name' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: 'Name can only contain letters, numbers, underscores, and hyphens' }
            ]}
          >
            <Input placeholder="e.g., nginx-setup" />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Brief description of what this playbook does" />
          </Form.Item>



          <Form.Item
            label="Playbook Content (YAML)"
            name="content"
            rules={[{ required: true, message: 'Please enter playbook content' }]}
          >
            <TextArea
              rows={15}
              placeholder="Enter your Ansible playbook in YAML format. Use {{ variable_name }} syntax for variables that will be prompted during execution."
              style={{ fontFamily: 'monospace', fontSize: '13px' }}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingPlaybook ? 'Update' : 'Create'} Playbook
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Playbooks; 
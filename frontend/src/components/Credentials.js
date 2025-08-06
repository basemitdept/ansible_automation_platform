import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Switch,
  Space,
  message,
  Popconfirm,
  Tag,
  Typography,
  Select
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
  UserOutlined,
  StarOutlined
} from '@ant-design/icons';
import { credentialsAPI } from '../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const Credentials = () => {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCredential, setEditingCredential] = useState(null);
  const [credentialType, setCredentialType] = useState('ssh');
  const [form] = Form.useForm();

  useEffect(() => {
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      setLoading(true);
      const response = await credentialsAPI.getAll();
      setCredentials(response.data);
    } catch (error) {
      message.error('Failed to fetch credentials');
      console.error('Error fetching credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCredential(null);
    form.resetFields();
    setCredentialType('ssh');
    setModalVisible(true);
  };

  const handleEdit = (credential) => {
    setEditingCredential(credential);
    setCredentialType(credential.credential_type || 'ssh');
    form.setFieldsValue({
      name: credential.name,
      credential_type: credential.credential_type || 'ssh',
      username: credential.username,
      description: credential.description,
      is_default: credential.is_default,
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      if (editingCredential) {
        await credentialsAPI.update(editingCredential.id, values);
        message.success('Credential updated successfully');
      } else {
        await credentialsAPI.create(values);
        message.success('Credential created successfully');
      }
      setModalVisible(false);
      fetchCredentials();
    } catch (error) {
      message.error('Failed to save credential');
      console.error('Error saving credential:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await credentialsAPI.delete(id);
      message.success('Credential deleted successfully');
      fetchCredentials();
    } catch (error) {
      message.error('Failed to delete credential');
      console.error('Error deleting credential:', error);
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <KeyOutlined style={{ color: '#1890ff' }} />
          <strong>{text}</strong>
          {record.is_default && (
            <Tag color="gold" icon={<StarOutlined />}>
              Default
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'credential_type',
      key: 'credential_type',
      render: (type) => (
        <Tag color={type === 'git_token' ? 'green' : 'blue'}>
          {type === 'git_token' ? 'Git Token' : 'SSH'}
        </Tag>
      ),
    },
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      render: (text, record) => {
        if (record.credential_type === 'git_token') {
          return <Text type="secondary">N/A</Text>;
        }
        return (
          <Space>
            <UserOutlined />
            <code>{text}</code>
          </Space>
        );
      },
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text) => text || <Text type="secondary">No description</Text>,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => new Date(text).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Edit
          </Button>
          <Popconfirm
            title="Are you sure you want to delete this credential?"
            onConfirm={() => handleDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="primary"
              danger
              size="small"
              icon={<DeleteOutlined />}
            >
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              SSH Credentials
            </Title>
            <Text type="secondary">
              Manage SSH credentials for Ansible automation
            </Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            Add Credential
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={credentials}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} credentials`,
          }}
        />
      </Card>

      <Modal
        title={editingCredential ? 'Edit Credential' : 'Add New Credential'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="Credential Name"
            rules={[
              { required: true, message: 'Please enter a name for this credential' },
              { max: 100, message: 'Name must be less than 100 characters' }
            ]}
          >
            <Input placeholder="e.g., Production SSH, Git Token" />
          </Form.Item>

          <Form.Item
            name="credential_type"
            label="Credential Type"
            rules={[{ required: true, message: 'Please select credential type' }]}
            initialValue="ssh"
          >
            <Select
              placeholder="Select credential type"
              onChange={(value) => setCredentialType(value)}
              value={credentialType}
            >
              <Select.Option value="ssh">SSH Credential</Select.Option>
              <Select.Option value="git_token">Git Token</Select.Option>
            </Select>
          </Form.Item>

          {credentialType === 'ssh' && (
            <>
              <Form.Item
                name="username"
                label="SSH Username"
                rules={[
                  { required: true, message: 'Please enter the SSH username' },
                  { max: 100, message: 'Username must be less than 100 characters' }
                ]}
              >
                <Input placeholder="e.g., ansible, ubuntu, root" />
              </Form.Item>

              <Form.Item
                name="password"
                label="SSH Password"
                rules={[
                  { required: !editingCredential, message: 'Please enter the SSH password' }
                ]}
              >
                <Input.Password 
                  placeholder={editingCredential ? "Leave blank to keep current password" : "Enter SSH password"} 
                />
              </Form.Item>
            </>
          )}

          {credentialType === 'git_token' && (
            <Form.Item
              name="token"
              label="Git Token"
              rules={[
                { required: !editingCredential, message: 'Please enter the Git token' }
              ]}
            >
              <Input.Password 
                placeholder={editingCredential ? "Leave blank to keep current token" : "Enter Git token (e.g., GitHub personal access token)"} 
              />
            </Form.Item>
          )}

          <Form.Item
            name="description"
            label="Description"
          >
            <TextArea 
              rows={3} 
              placeholder="Optional description for this credential" 
            />
          </Form.Item>

          <Form.Item
            name="is_default"
            label="Set as Default"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                {editingCredential ? 'Update' : 'Create'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Credentials; 
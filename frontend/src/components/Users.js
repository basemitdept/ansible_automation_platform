import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Typography,
  message,
  Popconfirm,
  Tag,
  Badge,
  Row,
  Col,
  Alert
} from 'antd';
import {
  UserOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CrownOutlined,
  EditFilled,
  EyeOutlined,
  LockOutlined
} from '@ant-design/icons';
import { usersAPI } from '../services/api';
import moment from 'moment';

const { Title, Text } = Typography;
const { Option } = Select;

const Users = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await usersAPI.getAll();
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      message.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      role: user.role
    });
    setModalVisible(true);
  };

  const handleSubmit = async (values) => {
    try {
      if (editingUser) {
        // Update user
        await usersAPI.update(editingUser.id, values);
        message.success('User updated successfully');
      } else {
        // Create user
        await usersAPI.create(values);
        message.success('User created successfully');
      }
      
      setModalVisible(false);
      form.resetFields();
      fetchUsers();
    } catch (error) {
      console.error('Failed to save user:', error);
      message.error(error.response?.data?.error || 'Failed to save user');
    }
  };

  const handleDelete = async (userId) => {
    try {
      await usersAPI.delete(userId);
      message.success('User deleted successfully');
      fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      message.error(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin':
        return 'red';
      case 'editor':
        return 'blue';
      case 'user':
        return 'green';
      default:
        return 'default';
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin':
        return <CrownOutlined />;
      case 'editor':
        return <EditFilled />;
      case 'user':
        return <EyeOutlined />;
      default:
        return <UserOutlined />;
    }
  };

  const getRoleDescription = (role) => {
    switch (role) {
      case 'admin':
        return 'Full access to all features including user management';
      case 'editor':
        return 'Can create and modify resources but cannot delete';
      case 'user':
        return 'Read-only access to view resources and execution history';
      default:
        return 'Unknown role';
    }
  };

  const canManageUsers = currentUser && currentUser.role === 'admin';

  const columns = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      render: (text, record) => (
        <Space>
          <UserOutlined />
          <span style={{ fontWeight: record.id === currentUser?.id ? 'bold' : 'normal' }}>
            {text}
          </span>
          {record.id === currentUser?.id && (
            <Tag color="gold" size="small">You</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role) => (
        <Tag color={getRoleColor(role)} icon={getRoleIcon(role)}>
          {role.toUpperCase()}
        </Tag>
      ),
      filters: [
        { text: 'Admin', value: 'admin' },
        { text: 'Editor', value: 'editor' },
        { text: 'User', value: 'user' },
      ],
      onFilter: (value, record) => record.role === value,
    },
    {
      title: 'Permissions',
      key: 'permissions',
      render: (_, record) => (
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {getRoleDescription(record.role)}
        </Text>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => {
        if (!date) return 'N/A';
        const momentDate = moment(date);
        return momentDate.isValid() ? momentDate.format('MMM DD, YYYY') : 'Invalid date';
      },
      sorter: (a, b) => {
        const dateA = moment(a.created_at);
        const dateB = moment(b.created_at);
        if (!dateA.isValid()) return 1;
        if (!dateB.isValid()) return -1;
        return dateA.unix() - dateB.unix();
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {canManageUsers && (
            <>
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
                size="small"
              >
                Edit
              </Button>
              <Popconfirm
                title="Delete User"
                description={
                  record.id === currentUser?.id 
                    ? "You cannot delete your own account"
                    : `Are you sure you want to delete user "${record.username}"?`
                }
                onConfirm={() => handleDelete(record.id)}
                okText="Yes"
                cancelText="No"
                okType="danger"
                disabled={record.id === currentUser?.id}
              >
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  danger
                  size="small"
                  disabled={record.id === currentUser?.id}
                >
                  Delete
                </Button>
              </Popconfirm>
            </>
          )}
          {!canManageUsers && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              No actions available
            </Text>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={
          <Space>
            <UserOutlined />
            <Title level={4} style={{ margin: 0 }}>
              User Management
            </Title>
            <Badge count={users.length} style={{ backgroundColor: '#52c41a' }} />
          </Space>
        }
        extra={
          canManageUsers && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              Add User
            </Button>
          )
        }
        className="card-container"
      >
        {!canManageUsers && (
          <Alert
            message="Limited Access"
            description="You have read-only access to user information. Only administrators can create, edit, or delete users."
            type="info"
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Card size="small">
              <div style={{ textAlign: 'center' }}>
                <CrownOutlined style={{ fontSize: 24, color: '#ff4d4f', marginBottom: 8 }} />
                <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                  {users.filter(u => u.role === 'admin').length}
                </div>
                <div style={{ color: '#666', fontSize: 12 }}>Administrators</div>
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <div style={{ textAlign: 'center' }}>
                <EditFilled style={{ fontSize: 24, color: '#1890ff', marginBottom: 8 }} />
                <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                  {users.filter(u => u.role === 'editor').length}
                </div>
                <div style={{ color: '#666', fontSize: 12 }}>Editors</div>
              </div>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <div style={{ textAlign: 'center' }}>
                <EyeOutlined style={{ fontSize: 24, color: '#52c41a', marginBottom: 8 }} />
                <div style={{ fontSize: 20, fontWeight: 'bold' }}>
                  {users.filter(u => u.role === 'user').length}
                </div>
                <div style={{ color: '#666', fontSize: 12 }}>Users</div>
              </div>
            </Card>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} users`,
          }}
        />
      </Card>

      <Modal
        title={
          <Space>
            <UserOutlined />
            {editingUser ? 'Edit User' : 'Create New User'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="username"
            label="Username"
            rules={[
              { required: true, message: 'Please enter username' },
              { min: 3, message: 'Username must be at least 3 characters' },
              { max: 50, message: 'Username cannot exceed 50 characters' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: 'Username can only contain letters, numbers, and underscores' }
            ]}
          >
            <Input 
              prefix={<UserOutlined />}
              placeholder="Enter username"
              disabled={editingUser !== null}
            />
          </Form.Item>

          {!editingUser && (
            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: true, message: 'Please enter password' },
                { min: 6, message: 'Password must be at least 6 characters' }
              ]}
            >
              <Input.Password 
                prefix={<LockOutlined />}
                placeholder="Enter password"
              />
            </Form.Item>
          )}

          {editingUser && (
            <Form.Item
              name="password"
              label="New Password (leave blank to keep current)"
              rules={[
                { min: 6, message: 'Password must be at least 6 characters' }
              ]}
            >
              <Input.Password 
                prefix={<LockOutlined />}
                placeholder="Enter new password (optional)"
              />
            </Form.Item>
          )}

          <Form.Item
            name="role"
            label="Role"
            rules={[{ required: true, message: 'Please select a role' }]}
          >
            <Select placeholder="Select user role">
              <Option value="admin">
                <Space>
                  <CrownOutlined style={{ color: '#ff4d4f' }} />
                  <span>Administrator</span>
                </Space>
              </Option>
              <Option value="editor">
                <Space>
                  <EditFilled style={{ color: '#1890ff' }} />
                  <span>Editor</span>
                </Space>
              </Option>
              <Option value="user">
                <Space>
                  <EyeOutlined style={{ color: '#52c41a' }} />
                  <span>User</span>
                </Space>
              </Option>
            </Select>
          </Form.Item>

          <Alert
            message="Role Permissions"
            description={
              <div>
                <div><strong>Administrator:</strong> Full access including user management</div>
                <div><strong>Editor:</strong> Can create and modify but cannot delete</div>
                <div><strong>User:</strong> Read-only access to view resources</div>
              </div>
            }
            type="info"
            style={{ marginBottom: 16 }}
            showIcon
          />

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                {editingUser ? 'Update User' : 'Create User'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Users;
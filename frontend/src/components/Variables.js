import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Typography,
  message,
  Popconfirm,
  Tag,
  Tooltip,
  Row,
  Col,
  theme
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
  KeyOutlined,
  UserOutlined
} from '@ant-design/icons';
import { variablesAPI } from '../services/api';
import { hasPermission } from '../utils/permissions';

const { Title, Text } = Typography;
const { TextArea } = Input;

const Variables = ({ currentUser }) => {
  const { token } = theme.useToken();
  const [variables, setVariables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingVariable, setEditingVariable] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchVariables();
  }, []);

  const fetchVariables = async () => {
    setLoading(true);
    try {
      const response = await variablesAPI.getAll();
      setVariables(response.data);
    } catch (error) {
      message.error('Failed to fetch variables');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingVariable(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (variable) => {
    setEditingVariable(variable);
    form.setFieldsValue({
      key: variable.key,
      value: variable.value,
      description: variable.description || ''
    });
    setModalVisible(true);
  };

  const handleDelete = async (variableId) => {
    try {
      await variablesAPI.delete(variableId);
      message.success('Variable deleted successfully');
      fetchVariables();
    } catch (error) {
      message.error('Failed to delete variable');
    }
  };

  const handleSubmit = async (values) => {
    try {
      if (editingVariable) {
        await variablesAPI.update(editingVariable.id, values);
        message.success('Variable updated successfully');
      } else {
        await variablesAPI.create(values);
        message.success('Variable created successfully');
      }
      setModalVisible(false);
      fetchVariables();
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to save variable';
      message.error(errorMessage);
    }
  };

  const columns = [
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      width: 200,
      render: (text) => (
        <Space>
          <KeyOutlined style={{ color: '#1890ff' }} />
          <Text code strong>{text}</Text>
        </Space>
      ),
      sorter: (a, b) => a.key.localeCompare(b.key),
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      width: 300,
      render: (text) => (
        <Text 
          ellipsis={{ tooltip: text }} 
          style={{ 
            maxWidth: 280,
            display: 'block',
            fontFamily: 'monospace',
            background: 'transparent',
            color: token.colorTextSecondary,
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: '500'
          }}
        >
          {text}
        </Text>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text) => text || <Text type="secondary">No description</Text>,
    },
    {
      title: 'Created By',
      dataIndex: 'user',
      key: 'user',
      width: 130,
      render: (user) => user ? (
        <Space>
          <UserOutlined />
          <Text>{user.username}</Text>
        </Space>
      ) : (
        <Text type="secondary">System</Text>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (text) => new Date(text).toLocaleDateString(),
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          {hasPermission(currentUser, 'edit') && (
            <Tooltip title="Edit Variable">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
                size="small"
              />
            </Tooltip>
          )}
          {hasPermission(currentUser, 'delete') && (
            <Popconfirm
              title="Delete Variable"
              description="Are you sure you want to delete this variable? This action cannot be undone."
              onConfirm={() => handleDelete(record.id)}
              okText="Yes"
              cancelText="No"
              okType="danger"
            >
              <Tooltip title="Delete Variable">
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  danger
                  size="small"
                />
              </Tooltip>
            </Popconfirm>
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
            <SettingOutlined />
            <Title level={4} style={{ margin: 0 }}>Variables Management</Title>
          </Space>
        }
        extra={
          hasPermission(currentUser, 'create') && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              Add Variable
            </Button>
          )
        }
        className="card-container"
      >
        <Table
          columns={columns}
          dataSource={variables}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `${range[0]}-${range[1]} of ${total} variables`,
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title={
          <Space>
            <SettingOutlined />
            {editingVariable ? 'Edit Variable' : 'Create Variable'}
          </Space>
        }
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
            label="Variable Key"
            name="key"
            rules={[
              { required: true, message: 'Please enter a variable key' },
              { 
                pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, 
                message: 'Key must start with a letter or underscore and contain only letters, numbers, and underscores' 
              }
            ]}
            extra="Use a descriptive name that follows variable naming conventions (e.g., server_name, database_host)"
          >
            <Input 
              placeholder="e.g., username, server_ip, database_name"
              prefix={<KeyOutlined />}
            />
          </Form.Item>

          <Form.Item
            label="Variable Value"
            name="value"
            rules={[{ required: true, message: 'Please enter a variable value' }]}
            extra="The value that will replace the variable in your playbooks"
          >
            <TextArea
              rows={4}
              placeholder="e.g., john_doe, 192.168.1.100, production_db"
            />
          </Form.Item>

          <Form.Item
            label="Description (Optional)"
            name="description"
            extra="Add a description to help others understand what this variable is used for"
          >
            <TextArea
              rows={2}
              placeholder="e.g., Username for system operations, Main server IP address, Database connection name"
            />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                {editingVariable ? 'Update' : 'Create'} Variable
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Variables;

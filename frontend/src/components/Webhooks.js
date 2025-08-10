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
  Tag,
  Select,
  Switch,
  Tooltip,
  Alert,
  Row,
  Col,
  Divider,
  Tabs,
  DatePicker
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LinkOutlined,
  CopyOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  SettingOutlined,
  KeyOutlined,
  EyeOutlined,
  EyeInvisibleOutlined
} from '@ant-design/icons';
import { webhooksAPI, playbooksAPI, hostsAPI, credentialsAPI, apiTokensAPI } from '../services/api';
import { hasPermission } from '../utils/permissions';
import moment from 'moment';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const Webhooks = ({ currentUser }) => {
  // Webhook states
  const [webhooks, setWebhooks] = useState([]);
  const [playbooks, setPlaybooks] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [form] = Form.useForm();
  
  // Token states
  const [tokens, setTokens] = useState([]);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenModalVisible, setTokenModalVisible] = useState(false);
  const [editingToken, setEditingToken] = useState(null);
  const [tokenForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('webhooks');
  const [showTokenValues, setShowTokenValues] = useState({});

  useEffect(() => {
    fetchWebhooks();
    fetchPlaybooks();
    fetchHosts();
    fetchCredentials();
    fetchTokens();
  }, []);

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const response = await webhooksAPI.getAll();
      // Sort by newest first (created_at descending)
      const sortedWebhooks = response.data.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      setWebhooks(sortedWebhooks);
    } catch (error) {
      message.error('Failed to fetch webhooks');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlaybooks = async () => {
    try {
      const response = await playbooksAPI.getAll();
      setPlaybooks(response.data);
    } catch (error) {
      message.error('Failed to fetch playbooks');
    }
  };

  const fetchHosts = async () => {
    try {
      const response = await hostsAPI.getAll();
      setHosts(response.data);
    } catch (error) {
      message.error('Failed to fetch hosts');
    }
  };

  const fetchCredentials = async () => {
    try {
      const response = await credentialsAPI.getAll();
      setCredentials(response.data);
    } catch (error) {
      message.error('Failed to fetch credentials');
    }
  };

  const handleCreate = () => {
    setEditingWebhook(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true });
    setModalVisible(true);
  };

  const handleEdit = (webhook) => {
    setEditingWebhook(webhook);
    
    // Parse host_ids and default_variables for form
    let hostIds = [];
    let defaultVariables = '';
    
    try {
      hostIds = JSON.parse(webhook.host_ids || '[]');
    } catch (e) {
      console.error('Error parsing host_ids:', e);
    }
    
    try {
      if (webhook.default_variables) {
        defaultVariables = JSON.stringify(JSON.parse(webhook.default_variables), null, 2);
      }
    } catch (e) {
      console.error('Error parsing default_variables:', e);
    }
    
    form.setFieldsValue({
      name: webhook.name,
      description: webhook.description,
      playbook_id: webhook.playbook_id,
      host_ids: hostIds,
      credential_id: webhook.credential_id,
      enabled: webhook.enabled,
      default_variables: defaultVariables
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try {
      await webhooksAPI.delete(id);
      message.success('Webhook deleted successfully');
      fetchWebhooks();
    } catch (error) {
      message.error('Failed to delete webhook');
    }
  };

  const handleSubmit = async (values) => {
    try {
      // Parse default_variables if provided
      let defaultVariables = null;
      if (values.default_variables && values.default_variables.trim()) {
        try {
          JSON.parse(values.default_variables); // Validate JSON
          defaultVariables = values.default_variables;
        } catch (e) {
          message.error('Invalid JSON format in default variables');
          return;
        }
      }

      const submitData = {
        ...values,
        default_variables: defaultVariables
      };

      if (editingWebhook) {
        await webhooksAPI.update(editingWebhook.id, submitData);
        message.success('Webhook updated successfully');
      } else {
        await webhooksAPI.create(submitData);
        message.success('Webhook created successfully');
      }
      setModalVisible(false);
      fetchWebhooks();
    } catch (error) {
      message.error(`Failed to ${editingWebhook ? 'update' : 'create'} webhook`);
    }
  };

  const handleRegenerateToken = async (id) => {
    try {
      await webhooksAPI.regenerateToken(id);
      message.success('Webhook token regenerated successfully');
      fetchWebhooks();
    } catch (error) {
      message.error('Failed to regenerate webhook token');
    }
  };

  const copyToClipboard = async (text) => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        message.success('Copied to clipboard');
        return;
      }
      
      // Fallback for browsers without clipboard API or HTTP contexts
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = '0';
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          message.success('Copied to clipboard');
        } else {
          throw new Error('Copy command failed');
        }
      } catch (err) {
        console.error('Fallback copy failed:', err);
        message.error('Copy to clipboard failed. Please copy manually.');
      } finally {
        document.body.removeChild(textArea);
      }
    } catch (error) {
      console.error('Copy to clipboard error:', error);
      message.error('Copy to clipboard failed. Please copy manually.');
    }
  };

  const getWebhookUrl = (webhook) => {
    return `${window.location.origin}/api/webhook/trigger/${webhook.token}`;
  };

  // Token functions
  const fetchTokens = async () => {
    setTokenLoading(true);
    try {
      const response = await apiTokensAPI.getAll();
      setTokens(response.data);
    } catch (error) {
      message.error('Failed to fetch API tokens');
    } finally {
      setTokenLoading(false);
    }
  };

  const handleCreateToken = () => {
    setEditingToken(null);
    tokenForm.resetFields();
    setTokenModalVisible(true);
  };

  const handleEditToken = (token) => {
    setEditingToken(token);
    tokenForm.setFieldsValue({
      name: token.name,
      description: token.description,
      enabled: token.enabled,
      expires_at: token.expires_at ? moment(token.expires_at) : null
    });
    setTokenModalVisible(true);
  };

  const handleDeleteToken = async (id) => {
    try {
      await apiTokensAPI.delete(id);
      message.success('API token deleted successfully');
      fetchTokens();
    } catch (error) {
      message.error('Failed to delete API token');
    }
  };

  const handleTokenSubmit = async (values) => {
    try {
      const submitData = {
        ...values,
        expires_at: values.expires_at ? values.expires_at.toISOString() : null
      };

      if (editingToken) {
        await apiTokensAPI.update(editingToken.id, submitData);
        message.success('API token updated successfully');
      } else {
        await apiTokensAPI.create(submitData);
        message.success('API token created successfully');
      }
      setTokenModalVisible(false);
      fetchTokens();
    } catch (error) {
      message.error(`Failed to ${editingToken ? 'update' : 'create'} API token`);
    }
  };

  const handleRegenerateApiToken = async (id) => {
    try {
      await apiTokensAPI.regenerate(id);
      message.success('API token regenerated successfully');
      fetchTokens();
    } catch (error) {
      message.error('Failed to regenerate API token');
    }
  };

  const toggleTokenVisibility = (tokenId) => {
    setShowTokenValues(prev => ({
      ...prev,
      [tokenId]: !prev[tokenId]
    }));
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <LinkOutlined style={{ color: '#1890ff' }} />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: 'Playbook',
      key: 'playbook',
      render: (_, record) => (
        <Tag color="blue">{record.playbook?.name || 'Unknown'}</Tag>
      ),
    },
    {
      title: 'Webhook URL',
      key: 'url',
      render: (_, record) => (
        <Space>
          <Text code style={{ 
            fontFamily: 'monospace', 
            fontSize: '12px',
            maxWidth: '300px',
            display: 'inline-block',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {getWebhookUrl(record)}
          </Text>
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined />}
            onClick={() => copyToClipboard(getWebhookUrl(record))}
          />
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled) => (
        <Tag color={enabled ? 'green' : 'red'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </Tag>
      ),
    },
    {
      title: 'Usage',
      key: 'usage',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Text style={{ fontSize: '12px' }}>
            Triggered: {record.trigger_count || 0} times
          </Text>
          {record.last_triggered && (
            <Text style={{ fontSize: '12px' }} type="secondary">
              Last: {moment(record.last_triggered).fromNow()}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => {
        if (!date) return '-';
        const momentDate = moment(date);
        return momentDate.isValid() ? momentDate.format('YYYY-MM-DD HH:mm') : '-';
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {hasPermission(currentUser, 'edit') ? (
            <Tooltip title="Edit webhook">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              />
            </Tooltip>
          ) : (
            <Tooltip title="View webhook">
              <Button
                size="small"
                icon={<LinkOutlined />}
                onClick={() => handleEdit(record)}
              />
            </Tooltip>
          )}
          {hasPermission(currentUser, 'edit') && (
            <Tooltip title="Regenerate token">
              <Popconfirm
                title="Regenerate webhook token?"
                description="This will invalidate the current webhook URL. Are you sure?"
                onConfirm={() => handleRegenerateToken(record.id)}
                okText="Yes"
                cancelText="No"
              >
                <Button size="small" icon={<ReloadOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
          {hasPermission(currentUser, 'delete_webhook') && (
            <Popconfirm
              title="Delete webhook?"
              description="This action cannot be undone."
              onConfirm={() => handleDelete(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const tokenColumns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          <KeyOutlined style={{ color: '#1890ff' }} />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: 'Token',
      dataIndex: 'token',
      key: 'token',
      render: (token, record) => (
        <Space>
          <Text code style={{ 
            fontFamily: 'monospace', 
            fontSize: '12px',
            maxWidth: '200px',
            display: 'inline-block',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {showTokenValues[record.id] ? token : `${token.substring(0, 8)}${'*'.repeat(token.length - 8)}`}
          </Text>
          <Button
            size="small"
            type="text"
            icon={showTokenValues[record.id] ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => toggleTokenVisibility(record.id)}
          />
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined />}
            onClick={() => copyToClipboard(token)}
          />
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (text) => text || <Text type="secondary">No description</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      render: (enabled) => (
        <Tag color={enabled ? 'green' : 'red'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </Tag>
      ),
    },
    {
      title: 'Usage',
      key: 'usage',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <Text style={{ fontSize: '12px' }}>
            Used: {record.usage_count || 0} times
          </Text>
          {record.last_used && (
            <Text style={{ fontSize: '12px' }} type="secondary">
              Last: {moment(record.last_used).fromNow()}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Expires',
      dataIndex: 'expires_at',
      key: 'expires_at',
      render: (expires_at) => {
        if (!expires_at) return <Text type="secondary">Never</Text>;
        const isExpired = moment(expires_at).isBefore(moment());
        return (
          <Tag color={isExpired ? 'red' : 'blue'}>
            {isExpired ? 'Expired' : moment(expires_at).fromNow()}
          </Tag>
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => {
        if (!date) return '-';
        const momentDate = moment(date);
        return momentDate.isValid() ? momentDate.format('YYYY-MM-DD HH:mm') : '-';
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit token">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditToken(record)}
            />
          </Tooltip>
          <Tooltip title="Regenerate token">
            <Popconfirm
              title="Regenerate API token?"
              description="This will invalidate the current token. Are you sure?"
              onConfirm={() => handleRegenerateApiToken(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button size="small" icon={<ReloadOutlined />} />
            </Popconfirm>
          </Tooltip>
          <Popconfirm
            title="Delete API token?"
            description="This action cannot be undone."
            onConfirm={() => handleDeleteToken(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'webhooks',
      label: (
        <Space>
          <LinkOutlined />
          Webhooks
        </Space>
      ),
      children: (
        <Card
          title={
            <Space>
              <LinkOutlined />
              <Title level={4} style={{ margin: 0 }}>Webhook Management</Title>
            </Space>
          }
          extra={
            hasPermission(currentUser, 'create') && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                New Webhook
              </Button>
            )
          }
          className="card-container"
        >
          <Alert
            message="Webhook Integration"
            description="Create webhooks to trigger playbook execution via HTTP POST requests. Each webhook generates a unique URL that can be called from external systems."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Table
            columns={columns}
            dataSource={webhooks}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => 
                `${range[0]}-${range[1]} of ${total} webhooks`,
            }}
          />
        </Card>
      ),
    },
    {
      key: 'tokens',
      label: (
        <Space>
          <KeyOutlined />
          API Tokens
        </Space>
      ),
      children: (
        <Card
          title={
            <Space>
              <KeyOutlined />
              <Title level={4} style={{ margin: 0 }}>API Token Management</Title>
            </Space>
          }
          extra={
            hasPermission(currentUser, 'create') && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleCreateToken}
              >
                New API Token
              </Button>
            )
          }
          className="card-container"
        >
          <Alert
            message="API Token Authentication"
            description="API tokens are required to call webhook endpoints. Include the token in the Authorization header as 'Bearer <token>' when making webhook requests."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Table
            columns={tokenColumns}
            dataSource={tokens}
            rowKey="id"
            loading={tokenLoading}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => 
                `${range[0]}-${range[1]} of ${total} tokens`,
            }}
          />
        </Card>
      ),
    },
  ];

  return (
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
        style={{ minHeight: '600px' }}
      />

      {/* Webhook Modal */}
      <Modal
        title={
          <Space>
            <LinkOutlined />
            {!hasPermission(currentUser, 'edit') && editingWebhook ? 'View Webhook' :
             editingWebhook ? 'Edit Webhook' : 'Create New Webhook'}
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
          disabled={!hasPermission(currentUser, 'edit')}
        >
          <Form.Item
            label="Webhook Name"
            name="name"
            rules={[{ required: true, message: 'Please enter webhook name' }]}
          >
            <Input placeholder="e.g., deploy-production" />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Brief description of what this webhook does" />
          </Form.Item>

          <Form.Item
            label="Playbook"
            name="playbook_id"
            rules={[{ required: true, message: 'Please select a playbook' }]}
          >
            <Select placeholder="Select playbook to execute">
              {playbooks.map(playbook => (
                <Option key={playbook.id} value={playbook.id}>
                  {playbook.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Target Hosts (Optional)"
            name="host_ids"
          >
            <Select
              mode="multiple"
              placeholder="Select hosts to execute playbook on (optional)"
              style={{ width: '100%' }}
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {hosts.map(host => (
                <Option key={host.id} value={host.id}>
                  {host.name} ({host.hostname})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Default Credential (Optional)"
            name="credential_id"
          >
            <Select
              placeholder="Select default credential for this webhook"
              allowClear
              style={{ width: '100%' }}
            >
              {credentials
                .filter(credential => credential.credential_type === 'ssh' || !credential.credential_type) // Show SSH credentials only
                .map(credential => (
                <Option key={credential.id} value={credential.id}>
                  {credential.name} ({credential.username})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Enabled"
            name="enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Divider orientation="left">
            <Space>
              <SettingOutlined />
              Default Variables (Optional)
            </Space>
          </Divider>

          <Alert
            message="Default Variables"
            description="Define default values for playbook variables. These can be overridden in the webhook request payload."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            label="Default Variables (JSON)"
            name="default_variables"
          >
            <TextArea
              rows={4}
              placeholder='{"variable_name": "default_value", "another_var": "value"}'
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              {hasPermission(currentUser, 'edit') && (
                <Button type="primary" htmlType="submit">
                  {editingWebhook ? 'Update' : 'Create'} Webhook
                </Button>
              )}
              <Button onClick={() => setModalVisible(false)}>
                {hasPermission(currentUser, 'edit') ? 'Cancel' : 'Close'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Token Modal */}
      <Modal
        title={
          <Space>
            <KeyOutlined />
            {editingToken ? 'Edit API Token' : 'Create New API Token'}
          </Space>
        }
        open={tokenModalVisible}
        onCancel={() => setTokenModalVisible(false)}
        width={600}
        footer={null}
      >
        <Form
          form={tokenForm}
          layout="vertical"
          onFinish={handleTokenSubmit}
        >
          <Form.Item
            label="Token Name"
            name="name"
            rules={[{ required: true, message: 'Please enter token name' }]}
          >
            <Input placeholder="e.g., Production API Access" />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Brief description of what this token is used for" />
          </Form.Item>

          <Form.Item
            label="Enabled"
            name="enabled"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="Expiration Date (Optional)"
            name="expires_at"
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder="Select expiration date"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Alert
            message="Security Note"
            description="API tokens provide full access to webhook endpoints. Store them securely and regenerate them regularly."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingToken ? 'Update' : 'Create'} Token
              </Button>
              <Button onClick={() => setTokenModalVisible(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Webhooks;
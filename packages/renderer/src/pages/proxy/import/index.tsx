import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Input,
  Space,
  message,
  Table,
  Tag,
  Typography,
  Row,
  Col,
  Alert
} from 'antd';
import { ArrowLeftOutlined, InboxOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { MihomoBridge } from '#preload';
import { MESSAGE_CONFIG } from '/@/constants';
import { useTranslation } from 'react-i18next';

const { TextArea } = Input;
const { Text, Title } = Typography;

interface ImportResult {
  success: boolean;
  id?: number;
  localPort?: number;
  name?: string;
  node?: any;
  error?: string;
  uri?: string;
}

const ProxyImportPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState<ImportResult[]>([]);
  const [messageApi, contextHolder] = message.useMessage(MESSAGE_CONFIG);

  const columns: ColumnsType<ImportResult> = [
    {
      title: '#',
      key: 'index',
      width: 60,
      render: (_, __, index) => index + 1
    },
    {
      title: '状态',
      dataIndex: 'success',
      key: 'status',
      width: 80,
      render: (success: boolean) => (
        <Tag icon={success ? <CheckCircleOutlined /> : <CloseCircleOutlined />} color={success ? 'success' : 'error'}>
          {success ? '成功' : '失败'}
        </Tag>
      )
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => name || record.uri || record.node?.server || '-'
    },
    {
      title: '类型',
      dataIndex: 'node',
      key: 'type',
      render: (node) => node?.type ? <Tag>{node.type.toUpperCase()}</Tag> : '-'
    },
    {
      title: '服务器',
      dataIndex: 'node',
      key: 'server',
      render: (node) => node?.server ? `${node.server}:${node.port}` : '-'
    },
    {
      title: '本地端口',
      dataIndex: 'localPort',
      key: 'localPort',
      render: (port) => port ? <Tag color="blue">{port}</Tag> : '-'
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      render: (error) => error ? <Text type="danger">{error}</Text> : '-'
    }
  ];

  const handleImport = async () => {
    if (!inputText.trim()) {
      messageApi.warning('请粘贴节点链接');
      return;
    }

    // 解析输入：每行一个链接
    const lines = inputText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));

    if (lines.length === 0) {
      messageApi.warning('未找到有效的节点链接');
      return;
    }

    setLoading(true);
    try {
      // 使用批量导入
      const importResults = await MihomoBridge.importNodes(lines);
      setResults(importResults || []);

       const successCount = (importResults || []).filter((r: {success?: boolean}) => r.success).length;
      if (successCount === lines.length) {
        messageApi.success(`成功导入 ${successCount} 个节点`);
      } else if (successCount > 0) {
        messageApi.warning(`导入 ${successCount}/${lines.length} 个节点成功，${lines.length - successCount} 个失败`);
      } else {
        messageApi.error('所有节点导入失败，请检查链接格式');
      }

      // 清空输入（保留已导入的）
      if (successCount === lines.length) {
        setInputText('');
      }
    } catch (e) {
      messageApi.error(`导入失败: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    navigate('/proxy');
  };

  const handleClearResults = () => {
    setResults([]);
  };

  const handleClearInput = () => {
    setInputText('');
    setResults([]);
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return (
    <div className="proxy-import-page" style={{ padding: '24px' }}>
      {contextHolder}

      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={handleGoBack}
        >
          {t('back') || '返回'}
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          导入代理节点
        </Title>
      </div>

      <Row gutter={[24, 24]}>
        <Col span={24}>
          <Card title="粘贴节点链接" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Alert
                message="支持以下格式"
                description={
                  <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                    <li><Text code>vless://</Text> - VLESS 协议（支持 Reality）</li>
                    <li><Text code>vmess://</Text> - VMess 协议</li>
                    <li><Text code>trojan://</Text> - Trojan 协议</li>
                    <li><Text code>ss://</Text> - Shadowsocks 协议</li>
                    <li><Text code>hysteria2://</Text> 或 <Text code>hy2://</Text> - Hysteria2 协议</li>
                    <li><Text code>tuic://</Text> - TUIC 协议</li>
                  </ul>
                }
                type="info"
                showIcon
              />

              <TextArea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="每行一个节点链接，例如：&#10;vless://xxx@server:443?...&#10;vmess://eyJhZGQiOi...&#10;trojan://password@server:443?..."
                rows={8}
                style={{ fontFamily: 'monospace', fontSize: '13px' }}
                disabled={loading}
              />

              <Space>
                <Button
                  type="primary"
                  onClick={handleImport}
                  loading={loading}
                  icon={<InboxOutlined />}
                >
                  导入节点
                </Button>
                <Button onClick={handleClearInput} disabled={loading}>
                  清空
                </Button>
                <Text type="secondary">
                  共 {inputText.split('\n').filter(l => l.trim() && !l.startsWith('#')).length} 个待导入
                </Text>
              </Space>
            </Space>
          </Card>
        </Col>

        {results.length > 0 && (
          <Col span={24}>
            <Card
              title={
                <Space>
                  <span>导入结果</span>
                  {successCount > 0 && <Tag color="green">成功 {successCount}</Tag>}
                  {failCount > 0 && <Tag color="red">失败 {failCount}</Tag>}
                </Space>
              }
              bordered={false}
              extra={
                <Button size="small" onClick={handleClearResults}>
                  清空结果
                </Button>
              }
            >
              <Table
                columns={columns}
                dataSource={results}
                rowKey={(_, index) => `result-${index}`}
                pagination={{ pageSize: 20 }}
                scroll={{ y: 400 }}
                size="middle"
              />
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
};

export default ProxyImportPage;

import './index.css';
import type {DB} from '../../../../../../shared/types/db';
import {Progress, Tag, Tooltip, Typography} from 'antd';
import {useTranslation} from 'react-i18next';

const {Text, Title} = Typography;

const FingerprintInfo = ({
  fingerprints,
  report,
}: {
  fingerprints: DB.FingerprintConfig;
  report?: DB.FingerprintHealthReport;
}) => {
  const {t} = useTranslation();
  const statusMeta = {
    healthy: {label: t('health_healthy'), color: 'success' as const},
    warning: {label: t('health_review'), color: 'warning' as const},
    error: {label: t('health_conflict'), color: 'error' as const},
  };
  const checkMeta = {
    pass: {label: t('health_pass'), color: 'success' as const},
    warning: {label: t('health_review'), color: 'warning' as const},
    fail: {label: t('health_failed'), color: 'error' as const},
  };
  const translatedValues: Record<string, string> = {
    'Direct connection': t('health_direct'),
    'Protected policy': t('health_value_protected'),
    Unavailable: t('health_value_unavailable'),
    Available: t('health_value_available'),
    'Browser default': t('health_value_browser_default'),
    'Real device': t('health_value_real_device'),
    'Real network': t('health_value_real_network'),
    'Resolved exit IP': t('health_value_resolved_ip'),
    'Proxy-only route': t('health_value_proxy_route'),
    'Proxy-only DNS policy': t('health_value_proxy_dns'),
    Enabled: t('health_value_enabled'),
    Disabled: t('health_value_disabled'),
  };
  const displayValue = (value?: string) => value ? translatedValues[value] || value : '-';

  if (!report) {
    return (
      <div className="fingerprint-wrapper">
        <Title level={5}>{t('health_title')}</Title>
        <Text type="secondary">{t('health_run_once')}</Text>
        <div className="fingerprint-placeholder-list">
          <div><Text type="secondary">{t('health_template')}</Text><Text>{fingerprints.templateId || t('profile_template_auto')}</Text></div>
          <div><Text type="secondary">{t('profile_platform')}</Text><Text>{fingerprints.platform || 'Win32'}</Text></div>
          <div><Text type="secondary">{t('profile_webrtc')}</Text><Text>{fingerprints.webRTCMode === 'proxy' ? t('profile_protected') : fingerprints.webRTCMode || t('profile_protected')}</Text></div>
          <div><Text type="secondary">{t('profile_canvas')}</Text><Text>{fingerprints.canvasMode === 'noise' ? t('profile_stable_noise') : fingerprints.canvasMode || t('profile_stable_noise')}</Text></div>
        </div>
      </div>
    );
  }

  const health = statusMeta[report.status];
  return (
    <div className="fingerprint-wrapper fingerprint-health-report">
      <div className="fingerprint-health-heading">
        <div>
          <Title level={5}>{t('health_title')}</Title>
          <Text type="secondary">{t('health_last_check')}</Text>
        </div>
        <Tag color={health.color}>{health.label}</Tag>
      </div>
      <Progress
        percent={report.score}
        status={report.status === 'error' ? 'exception' : report.status === 'healthy' ? 'success' : 'normal'}
        strokeColor={report.status === 'warning' ? '#faad14' : undefined}
      />
      <div className="fingerprint-health-meta">
        <Text type="secondary">{new Date(report.checkedAt).toLocaleString()}</Text>
        {report.proxyIp && <Text code>{report.proxyIp}</Text>}
      </div>
      <div className="fingerprint-check-list">
        {report.items.map(check => {
          const meta = checkMeta[check.status];
          const labelKey = `health_check_${check.key.replace(/-/g, '_')}`;
          return (
            <Tooltip
              key={check.key}
              title={<><div>{t('health_expected')}：{displayValue(check.expected)}</div><div>{t('health_actual')}：{displayValue(check.actual)}</div></>}
              placement="left"
            >
              <div className="fingerprint-check-row">
                <div className="fingerprint-check-copy">
                  <Text>{t(labelKey, {defaultValue: check.label})}</Text>
                  <Text type="secondary" ellipsis>{displayValue(check.actual)}</Text>
                </div>
                <Tag color={meta.color}>{meta.label}</Tag>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export default FingerprintInfo;


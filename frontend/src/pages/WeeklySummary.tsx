import { useState, useEffect } from 'react';
import { Card, DatePicker, Button, message, Divider } from 'antd';
import dayjs from 'dayjs';
import api from '../services/api';

const { RangePicker } = DatePicker;

const WeeklySummary = () => {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>({});
  const [weekRange, setWeekRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('week'),
    dayjs().endOf('week'),
  ]);

  useEffect(() => {
    fetchWeeklySummary();
  }, []);

  const fetchWeeklySummary = async () => {
    setLoading(true);
    try {
      const startDate = weekRange[0].format('YYYY-MM-DD');
      const endDate = weekRange[1].format('YYYY-MM-DD');
      // 如果数据为空，使用虚拟数据
      const response: any = await api.get('/statistics/weekly-summary', {
        params: { startDate, endDate, useMockData: 'true' },
      });
      if (response?.success && response?.data) {
        setSummary(response.data);
      } else {
        setSummary({});
      }
    } catch (error: any) {
      console.error('获取周运营数据失败:', error);
      setSummary({});
      if (error.response?.status !== 404) {
        message.error('获取周运营数据失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleWeekChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      setWeekRange([dates[0].startOf('week'), dates[1].endOf('week')]);
    }
  };

  const handleQuery = () => {
    fetchWeeklySummary();
  };

  // 计算确认收入（基于出勤的课消收入）
  const lessonPrice = 100;
  const confirmedRevenue = summary.confirmedRevenue || (summary.totalAttendance || 0) * lessonPrice;
  const rosterCount = summary.rosterCount || 0;
  const avgAttendanceRate = summary.avgAttendanceRate || 0;

  // 上周数据
  const lastWeek = summary.lastWeek || {};
  const lastWeekConfirmedRevenue = lastWeek.confirmedRevenue || 0;
  const lastWeekRosterCount = lastWeek.rosterCount || 0;
  const lastWeekAvgAttendanceRate = lastWeek.avgAttendanceRate || 0;

  // 计算变化
  const revenueChange = confirmedRevenue - lastWeekConfirmedRevenue;
  const rosterChange = rosterCount - lastWeekRosterCount;
  const attendanceRateChange = avgAttendanceRate - lastWeekAvgAttendanceRate;

  // 分析确认收入变化的直接原因
  const getRevenueChangeReason = () => {
    if (revenueChange === 0) {
      return '确认收入与上周持平';
    }

    const reasons: string[] = [];
    
    // 花名册人数变化的影响（基于上周出勤率）
    if (rosterChange !== 0 && lastWeekAvgAttendanceRate > 0) {
      // 估算：假设每周课程数相同，花名册人数变化对收入的影响 = 人数变化 × 上周出勤率 × 课程数 × 单价
      const estimatedWeeklyCourses = summary.totalSchedules || 1;
      // 简化计算：基于上周平均出勤率估算
      const rosterImpact = rosterChange * (lastWeekAvgAttendanceRate / 100) * estimatedWeeklyCourses * lessonPrice;
      if (Math.abs(rosterImpact) > 0.01) {
        reasons.push(`花名册人数${rosterChange > 0 ? '增加' : '减少'}${Math.abs(rosterChange)}人，影响收入约${rosterChange > 0 ? '+' : ''}¥${Math.abs(rosterImpact).toFixed(2)}`);
      }
    }

    // 出勤率变化的影响（基于当前花名册人数）
    if (attendanceRateChange !== 0 && rosterCount > 0) {
      const estimatedWeeklyCourses = summary.totalSchedules || 1;
      const attendanceRateImpact = rosterCount * (attendanceRateChange / 100) * estimatedWeeklyCourses * lessonPrice;
      if (Math.abs(attendanceRateImpact) > 0.01) {
        reasons.push(`出勤率${attendanceRateChange > 0 ? '提升' : '下降'}${Math.abs(attendanceRateChange)}个百分点，影响收入约${attendanceRateChange > 0 ? '+' : ''}¥${Math.abs(attendanceRateImpact).toFixed(2)}`);
      }
    }

    if (reasons.length === 0) {
      return '确认收入变化主要由出勤人次变化导致';
    }

    return reasons.join('；');
  };

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>周总结</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <RangePicker
              value={weekRange}
              onChange={handleWeekChange}
              format="YYYY-MM-DD"
            />
            <Button type="primary" onClick={handleQuery}>
              查询
            </Button>
          </div>
        </div>

        {/* 确认收入总结 */}
        <Card 
          title="确认收入总结" 
          style={{ marginBottom: 24 }}
          loading={loading}
        >
          <div style={{ fontSize: '16px', lineHeight: '2', whiteSpace: 'pre-line' }}>
            <div style={{ marginBottom: 16 }}>
              <strong>本周数据：</strong>周课消收入 ¥{confirmedRevenue.toFixed(2)}，出勤率 {avgAttendanceRate}%，花名册人数 {rosterCount} 人
            </div>
            
            {/* 教练员工作分析 */}
            <div style={{ marginBottom: 16 }}>
              <strong>教练员工作分析：</strong>
              <div style={{ marginLeft: 20, marginTop: 8 }}>
                {summary.teacherAnalysis?.lowAttendanceTeachers?.length > 0 ? (
                  <div>
                    • 低出勤教练员（负责学员出勤率低于60%）：
                    {summary.teacherAnalysis.lowAttendanceTeachers.map((teacher: any, index: number) => (
                      <span key={teacher.name} style={{ marginLeft: 8 }}>
                        {teacher.name}（{teacher.attendanceRate}%）
                        {index < summary.teacherAnalysis.lowAttendanceTeachers.length - 1 ? '、' : ''}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div>• 低出勤教练员：无</div>
                )}
                {summary.teacherAnalysis?.highLossTeachers?.length > 0 ? (
                  <div style={{ marginTop: 8 }}>
                    • 活跃学员流失多教练员（学员流失大于2人）：
                    {summary.teacherAnalysis.highLossTeachers.map((teacher: any, index: number) => (
                      <span key={teacher.name} style={{ marginLeft: 8 }}>
                        {teacher.name}（流失{teacher.lostStudents}人）
                        {index < summary.teacherAnalysis.highLossTeachers.length - 1 ? '、' : ''}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>• 活跃学员流失多教练员：无</div>
                )}
              </div>
            </div>

            {/* 需重点关注的班级 */}
            <div style={{ marginBottom: 16 }}>
              <strong>需重点关注的班级：</strong>
              <div style={{ marginLeft: 20, marginTop: 8 }}>
                {summary.keyClasses?.unopenedClasses?.length > 0 ? (
                  <div>
                    • 未开班：
                    {summary.keyClasses.unopenedClasses.map((classItem: any, index: number) => (
                      <span key={`${classItem.code}-${index}`} style={{ marginLeft: 8 }}>
                        {classItem.name}（{classItem.code}）
                        {index < summary.keyClasses.unopenedClasses.length - 1 ? '、' : ''}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div>• 未开班：无</div>
                )}
                {summary.keyClasses?.lowAttendanceClasses?.length > 0 ? (
                  <div style={{ marginTop: 8 }}>
                    • 出勤率低于50%：
                    {summary.keyClasses.lowAttendanceClasses.map((classItem: any, index: number) => (
                      <span key={`${classItem.code}-${index}`} style={{ marginLeft: 8 }}>
                        {classItem.name}（{classItem.code}，出勤率{classItem.attendanceRate}%）
                        {index < summary.keyClasses.lowAttendanceClasses.length - 1 ? '、' : ''}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>• 出勤率低于50%：无</div>
                )}
                {summary.keyClasses?.reducedStudentClasses?.length > 0 ? (
                  <div style={{ marginTop: 8 }}>
                    • 人数减少：
                    {summary.keyClasses.reducedStudentClasses.map((classItem: any, index: number) => (
                      <span key={`${classItem.code}-${index}`} style={{ marginLeft: 8 }}>
                        {classItem.name}（{classItem.code}，减少{classItem.reduction}人）
                        {index < summary.keyClasses.reducedStudentClasses.length - 1 ? '、' : ''}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>• 人数减少：无</div>
                )}
              </div>
            </div>
            
            {(lastWeekConfirmedRevenue > 0 || summary.lastWeek) && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div>周课消较上周变化为：{revenueChange >= 0 ? '+' : ''}¥{revenueChange.toFixed(2)}（{revenueChange >= 0 ? '增长' : '下降'} {revenueChange !== 0 && lastWeekConfirmedRevenue > 0 ? Math.abs((revenueChange / lastWeekConfirmedRevenue) * 100).toFixed(1) : '0'}%）</div>
                  <div>出勤率变化为：{attendanceRateChange >= 0 ? '+' : ''}{attendanceRateChange} 个百分点（{attendanceRateChange >= 0 ? '提升' : '下降'}）</div>
                  <div>花名册人数变化为：{rosterChange >= 0 ? '+' : ''}{rosterChange} 人（{rosterChange >= 0 ? '增加' : '减少'} {rosterChange !== 0 && lastWeekRosterCount > 0 ? Math.abs((rosterChange / lastWeekRosterCount) * 100).toFixed(1) : '0'}%）</div>
                </div>
                
                {lastWeekConfirmedRevenue > 0 && (
                  <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
                    <strong>确认收入变化原因分析：</strong>
                    <div style={{ marginTop: 8 }}>{getRevenueChangeReason()}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        <Divider />

        {/* 现金流收入总结 */}
        <Card 
          title="现金流收入总结" 
          loading={loading}
        >
          <div style={{ fontSize: '16px', lineHeight: '2', whiteSpace: 'pre-line' }}>
            {/* 本周数据分析 */}
            <div style={{ marginBottom: 24 }}>
              <strong style={{ fontSize: '18px' }}>本周数据分析：</strong>
              <div style={{ marginLeft: 20, marginTop: 12 }}>
                <div><strong>结果指标：</strong>本周新增学员 {summary.totalNewStudents || 0} 人，新增报名 {summary.totalNewEnrollments || 0} 人，新增班级 {summary.newClasses || 0} 个。</div>
                <div style={{ marginTop: 8 }}><strong>过程指标：</strong>鱼池添加数 {summary.poolAddedCount || 0} 人，邀约数 {summary.invitationCount || 0} 人，到场数 {summary.attendanceCount || 0} 人。</div>
                <div style={{ marginTop: 8 }}>本周现金流收入（缴费）为 ¥{(summary.totalRevenue || 0).toFixed(2)}。</div>
                <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f0f7ff', borderRadius: 4 }}>
                  <strong>续费情况汇总：</strong>
                  <div style={{ marginLeft: 20, marginTop: 8 }}>
                    <div>续费总金额：¥{(summary.renewalTotalAmount || 0).toFixed(2)}</div>
                    <div style={{ marginTop: 4 }}>续费单数：{summary.renewalOrderCount || 0} 单</div>
                    <div style={{ marginTop: 4 }}>续费客单价：¥{(summary.renewalAvgPrice || 0).toFixed(2)}</div>
                    <div style={{ marginTop: 4 }}>续费率：{(summary.renewalRate || 0).toFixed(2)}%（续费学员数/当月5节课以内学员数）</div>
                  </div>
                </div>
                {summary.dailyData && summary.dailyData.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    本周每日现金流收入情况：
                    {summary.dailyData.map((day: any, index: number) => (
                      <div key={index} style={{ marginLeft: 20, marginTop: 4 }}>
                        {day.date}：新增学员 {day.newStudents || 0} 人，新增报名 {day.newEnrollments || 0} 人，现金流收入 ¥{(day.revenue || 0).toFixed(2)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 个人工作表现分析 */}
            <div style={{ marginBottom: 24 }}>
              <strong style={{ fontSize: '18px' }}>个人工作表现分析：</strong>
              <div style={{ marginLeft: 20, marginTop: 12 }}>
                {(() => {
                  const totalNewStudents = summary.totalNewStudents || 0;
                  const totalNewEnrollments = summary.totalNewEnrollments || 0;
                  const totalRevenue = summary.totalRevenue || 0;
                  const avgRevenuePerEnrollment = totalNewEnrollments > 0 ? totalRevenue / totalNewEnrollments : 0;
                  
                  const analysis: string[] = [];
                  
                  if (totalNewStudents >= 5) {
                    analysis.push(`新增学员表现优秀，本周新增 ${totalNewStudents} 人，超出平均水平。`);
                  } else if (totalNewStudents >= 3) {
                    analysis.push(`新增学员表现良好，本周新增 ${totalNewStudents} 人，达到预期目标。`);
                  } else if (totalNewStudents > 0) {
                    analysis.push(`新增学员表现一般，本周新增 ${totalNewStudents} 人，建议加强招生力度。`);
                  } else {
                    analysis.push(`本周无新增学员，需要重点关注招生工作。`);
                  }
                  
                  if (totalNewEnrollments >= 8) {
                    analysis.push(`新增报名表现优秀，本周新增报名 ${totalNewEnrollments} 人，转化率较高。`);
                  } else if (totalNewEnrollments >= 5) {
                    analysis.push(`新增报名表现良好，本周新增报名 ${totalNewEnrollments} 人，转化效果不错。`);
                  } else if (totalNewEnrollments > 0) {
                    analysis.push(`新增报名表现一般，本周新增报名 ${totalNewEnrollments} 人，建议提升转化能力。`);
                  } else {
                    analysis.push(`本周无新增报名，需要加强销售转化工作。`);
                  }
                  
                  if (avgRevenuePerEnrollment >= 2000) {
                    analysis.push(`客单价表现优秀，平均每单金额 ¥${avgRevenuePerEnrollment.toFixed(2)}，销售质量较高。`);
                  } else if (avgRevenuePerEnrollment >= 1500) {
                    analysis.push(`客单价表现良好，平均每单金额 ¥${avgRevenuePerEnrollment.toFixed(2)}，销售质量稳定。`);
                  } else if (avgRevenuePerEnrollment > 0) {
                    analysis.push(`客单价表现一般，平均每单金额 ¥${avgRevenuePerEnrollment.toFixed(2)}，建议提升销售技巧。`);
                  }
                  
                  if (totalRevenue >= 10000) {
                    analysis.push(`现金流收入表现优秀，本周收入 ¥${totalRevenue.toFixed(2)}，完成度较高。`);
                  } else if (totalRevenue >= 5000) {
                    analysis.push(`现金流收入表现良好，本周收入 ¥${totalRevenue.toFixed(2)}，达到基本目标。`);
                  } else if (totalRevenue > 0) {
                    analysis.push(`现金流收入表现一般，本周收入 ¥${totalRevenue.toFixed(2)}，需要进一步提升。`);
                  } else {
                    analysis.push(`本周无现金流收入，需要重点关注收款工作。`);
                  }
                  
                  return analysis.map((item, index) => (
                    <div key={index} style={{ marginTop: index > 0 ? 8 : 0 }}>{item}</div>
                  ));
                })()}
              </div>
            </div>

            {/* 下周工作建议 */}
            <div style={{ marginBottom: 16 }}>
              <strong style={{ fontSize: '18px' }}>下周工作建议：</strong>
              
              {/* 模块1：目标完成度分析 */}
              {summary.workSuggestions?.module1 && (
                <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f0f7ff', borderRadius: 4, marginBottom: 12 }}>
                  <strong style={{ fontSize: '16px' }}>模块1：目标完成度分析及下周目标调整</strong>
                  <div style={{ marginLeft: 20, marginTop: 12 }}>
                    <div style={{ marginBottom: 8 }}>
                      <strong>本周目标完成情况：</strong>
                      <div style={{ marginLeft: 20, marginTop: 4 }}>
                        <div>新增学员：{summary.totalNewStudents || 0} / {summary.workSuggestions.module1.targets.newStudents}（完成度 {summary.workSuggestions.module1.completion.newStudents}%）</div>
                        <div>新增报名：{summary.totalNewEnrollments || 0} / {summary.workSuggestions.module1.targets.newEnrollments}（完成度 {summary.workSuggestions.module1.completion.newEnrollments}%）</div>
                        <div>现金流收入：¥{(summary.totalRevenue || 0).toFixed(2)} / ¥{summary.workSuggestions.module1.targets.totalRevenue}（完成度 {summary.workSuggestions.module1.completion.totalRevenue}%）</div>
                        <div>鱼池添加数：{summary.poolAddedCount || 0} / {summary.workSuggestions.module1.targets.poolAddedCount}（完成度 {summary.workSuggestions.module1.completion.poolAddedCount}%）</div>
                      </div>
                    </div>
                    <div>
                      <strong>下周工作目标调整：</strong>
                      <div style={{ marginLeft: 20, marginTop: 4 }}>
                        <div>新增学员目标：{summary.workSuggestions.module1.nextWeekTargets.newStudents} 人</div>
                        <div>新增报名目标：{summary.workSuggestions.module1.nextWeekTargets.newEnrollments} 人</div>
                        <div>现金流收入目标：¥{summary.workSuggestions.module1.nextWeekTargets.totalRevenue.toFixed(2)}</div>
                        <div>鱼池添加数目标：{summary.workSuggestions.module1.nextWeekTargets.poolAddedCount} 人</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 模块2：过程数据分析 */}
              {summary.workSuggestions?.module2 && (
                <div style={{ marginTop: 12, padding: 12, backgroundColor: '#fff7e6', borderRadius: 4, marginBottom: 12 }}>
                  <strong style={{ fontSize: '16px' }}>模块2：整体过程数据分析</strong>
                  <div style={{ marginLeft: 20, marginTop: 12 }}>
                    <div style={{ marginBottom: 8 }}>
                      <div>爽约率：{summary.workSuggestions.module2.noShowRate}%</div>
                      <div>成单率：{summary.workSuggestions.module2.conversionRate}%</div>
                    </div>
                    <div>
                      <strong>发现的问题：</strong>
                      <div style={{ marginLeft: 20, marginTop: 4 }}>
                        {summary.workSuggestions.module2.issues?.map((issue: string, index: number) => (
                          <div key={index} style={{ marginTop: index > 0 ? 4 : 0 }}>• {issue}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 模块3：个人表现分析 */}
              {summary.workSuggestions?.module3 && summary.workSuggestions.module3.length > 0 && (
                <div style={{ marginTop: 12, padding: 12, backgroundColor: '#fff1f0', borderRadius: 4 }}>
                  <strong style={{ fontSize: '16px' }}>模块3：个人表现分析及建议</strong>
                  <div style={{ marginLeft: 20, marginTop: 12 }}>
                    {summary.workSuggestions.module3.map((person: any, index: number) => (
                      <div key={index} style={{ marginBottom: 16, padding: 8, backgroundColor: '#fff', borderRadius: 4 }}>
                        <strong>{person.name}：</strong>
                        <div style={{ marginLeft: 20, marginTop: 4 }}>
                          <div>结果数据：新增报名 {person.resultData?.newEnrollments || 0} 人，现金流收入 ¥{(person.resultData?.totalRevenue || 0).toFixed(2)}</div>
                          <div>过程数据：添加数 {person.processData?.poolAddedCount || 0} 人，邀约数 {person.processData?.invitationCount || 0} 人，到场数 {person.processData?.attendanceCount || 0} 人</div>
                          <div style={{ marginTop: 4, color: '#ff4d4f' }}>
                            <strong>建议：</strong>{person.suggestions}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </Card>
    </div>
  );
};

export default WeeklySummary;


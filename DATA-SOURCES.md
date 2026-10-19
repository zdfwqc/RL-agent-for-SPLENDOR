# 数据来源与核验

2026-10-17，使用如下公开数据逐卡比对 90 张发展卡的等级、奖励色、分数及五色费用；归一化后 90/90 一致：

- https://github.com/bouk/splendimax/blob/master/Splendor%20Cards.csv
- https://github.com/seal256/splendor/blob/master/assets/cards.csv

贵族采用 seal256/splendor 的 `src/splendor.cpp` 中十组数值，并与 bouk 的 `src/noble.rs` 九组共同项核对；bouk 缺少白四蓝四，已补入。另一份 boardgamers/splendor 牌表存在贵族三色组合差异，未用作权威数据。

- https://github.com/seal256/splendor/blob/master/src/splendor.cpp
- https://github.com/bouk/splendimax/blob/master/src/noble.rs
- 官方规则：https://cdn.svc.asmodee.net/production-unboxnowcom/uploads/2022/02/Splendor-EN.pdf

以上两个仓库未发现 LICENSE 文件；本项目未复制它们的实现代码，仅将游戏的数值事实转换为独立 JSON。来源记录不是对上游代码、美术或商标的授权。Splendor / 璀璨宝石属于其权利人；本项目为非官方本地研究环境，不包含官方卡面。

复核脚本 `scripts/build_catalog.py` 读取 `.research/bouk.csv`、`seal.csv`、`seal.cpp`；下载来源即上述链接对应的 raw 内容。JSON 已随项目提供，正常运行无需联网。

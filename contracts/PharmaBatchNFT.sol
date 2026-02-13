// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract PharmaBatchNFT is ERC721URIStorage, AccessControl, Pausable, ReentrancyGuard {
    using MessageHashUtils for bytes32;

    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant LAB_ROLE = keccak256("LAB_ROLE");
    bytes32 public constant INSPECTOR_ROLE = keccak256("INSPECTOR_ROLE");

    uint256 public constant BPS_DENOMINATOR = 10_000;

    uint256 private _tokenIdCounter;
    uint256 private _reportIdCounter;

    uint256 public minStakeWei = 0.002 ether;
    uint256 public mediumStakeWei = 0.005 ether;
    uint256 public highStakeWei = 0.01 ether;
    uint256 public baseRewardWei = 0.002 ether;
    uint256 public falseReportSlashBps = 7_000;
    uint256 public bountyPoolWei;

    uint256 public reportCooldownSec = 6 hours;
    uint256 public maxOpenReportsPerReporter = 5;
    int256 public minReputationForSeverityThree = 5;

    uint256 public totalBatchesMinted;
    uint256 public totalReportsFiled;
    uint256 public totalOpenReports;
    uint256 public totalConfirmedFakeReports;

    enum ReportStatus {
        Pending,
        ConfirmedFake,
        RejectedFalse
    }

    struct ManufacturerProfile {
        string licenseNo;
        string legalName;
        bool active;
    }

    struct LabProfile {
        string accreditationId;
        bool active;
    }

    struct ReporterProfile {
        int256 reputation;
        uint32 reportsSubmitted;
        uint32 reportsConfirmed;
        uint32 reportsRejected;
        uint32 openReports;
        uint64 lastReportAt;
        bool blocked;
    }

    struct Batch {
        string productName;
        string manufacturerName;
        string manufacturerLicenseNo;
        string batchNumber;
        uint64 mfgDate;
        uint64 expiryTimestamp;
        string apiHash;
        bytes32 packagingHash;
        string currentOwnerType;
        address currentCustodian;
        uint64 lastVerified;
        string modelHash;
        uint32 openReports;
        uint32 pendingSevereReports;
        bool quarantined;
        bool flaggedHighRisk;
    }

    struct LabAttestation {
        address lab;
        bytes32 reportHash;
        bool passed;
        uint16 confidenceBps;
        uint64 attestedAt;
    }

    struct FakeReport {
        uint256 reportId;
        uint256 tokenId;
        address reporter;
        bytes32 identityNullifier;
        string evidenceURI;
        string reason;
        uint8 severity;
        uint256 stakeAmount;
        uint64 createdAt;
        uint64 resolvedAt;
        ReportStatus status;
        address resolver;
    }

    mapping(address => ManufacturerProfile) public manufacturers;
    mapping(address => LabProfile) public labs;
    mapping(address => ReporterProfile) public reporterProfiles;

    mapping(uint256 => Batch) public batches;
    mapping(uint256 => LabAttestation[]) private _labAttestationsByBatch;

    mapping(uint256 => FakeReport) public reports;
    mapping(uint256 => uint256[]) private _reportsByBatch;
    mapping(bytes32 => bool) public identityNullifierUsed;
    mapping(address => mapping(uint256 => bool)) public hasOpenReportForBatch;

    uint256[] private _highRiskBatchIds;
    mapping(uint256 => uint256) private _highRiskIndexPlusOne;

    event ManufacturerRegistered(address indexed manufacturer, string licenseNo, bool active);
    event LabRegistered(address indexed lab, string accreditationId, bool active);
    event ReporterBlocked(address indexed reporter, bool blocked);

    event BatchMinted(
        uint256 indexed tokenId,
        string batchNumber,
        string productName,
        string manufacturerLicenseNo
    );
    event BatchOwnershipMoved(uint256 indexed tokenId, address indexed newOwner, string newOwnerType);
    event CustodyCheckpoint(
        uint256 indexed tokenId,
        address indexed actor,
        bytes32 indexed locationHash,
        string ownerType,
        uint64 at
    );

    event LabAttestationSubmitted(
        uint256 indexed tokenId,
        address indexed lab,
        bytes32 indexed reportHash,
        bool passed,
        uint16 confidenceBps
    );
    event AIFederatedUpdate(uint256 indexed tokenId, string newModelHash, address indexed updatedBy);

    event BountyFunded(address indexed funder, uint256 amount, uint256 poolAfterFunding);
    event SuspiciousBatchReported(
        uint256 indexed reportId,
        uint256 indexed tokenId,
        address indexed reporter,
        uint8 severity,
        uint256 stakeAmount
    );
    event ReportResolved(
        uint256 indexed reportId,
        bool confirmedFake,
        uint256 payoutWei,
        int256 newReputationScore
    );
    event HighRiskFlagUpdated(uint256 indexed tokenId, bool flaggedHighRisk);
    event BatchQuarantineUpdated(uint256 indexed tokenId, bool quarantined, string reasonCode);

    constructor() ERC721("PharmaGuardBatch", "PGNFT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGULATOR_ROLE, msg.sender);
        _grantRole(MANUFACTURER_ROLE, msg.sender);
        _grantRole(LAB_ROLE, msg.sender);
        _grantRole(INSPECTOR_ROLE, msg.sender);

        manufacturers[msg.sender] = ManufacturerProfile({
            licenseNo: "BOOTSTRAP-LICENSE",
            legalName: "Bootstrap Manufacturer",
            active: true
        });
        labs[msg.sender] = LabProfile({accreditationId: "BOOTSTRAP-LAB", active: true});
    }

    receive() external payable {
        bountyPoolWei += msg.value;
        emit BountyFunded(msg.sender, msg.value, bountyPoolWei);
    }

    function registerManufacturer(
        address manufacturer,
        string calldata licenseNo,
        string calldata legalName,
        bool active
    ) external onlyRole(REGULATOR_ROLE) {
        require(manufacturer != address(0), "Invalid manufacturer");

        manufacturers[manufacturer] = ManufacturerProfile({
            licenseNo: licenseNo,
            legalName: legalName,
            active: active
        });

        if (active) {
            _grantRole(MANUFACTURER_ROLE, manufacturer);
        } else {
            _revokeRole(MANUFACTURER_ROLE, manufacturer);
        }

        emit ManufacturerRegistered(manufacturer, licenseNo, active);
    }

    function registerLab(
        address lab,
        string calldata accreditationId,
        bool active
    ) external onlyRole(REGULATOR_ROLE) {
        require(lab != address(0), "Invalid lab");

        labs[lab] = LabProfile({accreditationId: accreditationId, active: active});

        if (active) {
            _grantRole(LAB_ROLE, lab);
        } else {
            _revokeRole(LAB_ROLE, lab);
        }

        emit LabRegistered(lab, accreditationId, active);
    }

    function setInspector(address inspector, bool enabled) external onlyRole(REGULATOR_ROLE) {
        require(inspector != address(0), "Invalid inspector");

        if (enabled) {
            _grantRole(INSPECTOR_ROLE, inspector);
        } else {
            _revokeRole(INSPECTOR_ROLE, inspector);
        }
    }

    function setReporterBlocked(address reporter, bool blocked) external onlyRole(REGULATOR_ROLE) {
        reporterProfiles[reporter].blocked = blocked;
        emit ReporterBlocked(reporter, blocked);
    }

    function setPolicyParameters(
        uint256 newMinStakeWei,
        uint256 newMediumStakeWei,
        uint256 newHighStakeWei,
        uint256 newBaseRewardWei,
        uint256 newFalseReportSlashBps,
        uint256 newReportCooldownSec,
        uint256 newMaxOpenReportsPerReporter,
        int256 newMinReputationForSeverityThree
    ) external onlyRole(REGULATOR_ROLE) {
        require(newMinStakeWei > 0, "Min stake must be > 0");
        require(newMediumStakeWei >= newMinStakeWei, "Medium stake too low");
        require(newHighStakeWei >= newMediumStakeWei, "High stake too low");
        require(newFalseReportSlashBps <= BPS_DENOMINATOR, "Invalid slash bps");
        require(newMaxOpenReportsPerReporter > 0, "Max open reports must be > 0");

        minStakeWei = newMinStakeWei;
        mediumStakeWei = newMediumStakeWei;
        highStakeWei = newHighStakeWei;
        baseRewardWei = newBaseRewardWei;
        falseReportSlashBps = newFalseReportSlashBps;
        reportCooldownSec = newReportCooldownSec;
        maxOpenReportsPerReporter = newMaxOpenReportsPerReporter;
        minReputationForSeverityThree = newMinReputationForSeverityThree;
    }

    function fundBountyPool() external payable onlyRole(REGULATOR_ROLE) {
        require(msg.value > 0, "No funds provided");

        bountyPoolWei += msg.value;
        emit BountyFunded(msg.sender, msg.value, bountyPoolWei);
    }

    function withdrawBountyPool(uint256 amount, address payable to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        require(to != address(0), "Invalid receiver");
        require(amount <= bountyPoolWei, "Insufficient bounty pool");

        bountyPoolWei -= amount;

        (bool sent, ) = to.call{value: amount}("");
        require(sent, "Transfer failed");
    }

    function mintBatch(
        address to,
        string memory batchNumber,
        string memory manufacturerName,
        uint256 expiryTimestamp,
        string memory apiHash,
        string memory tokenURI,
        bytes memory manufacturerSignature
    ) public whenNotPaused onlyRole(MANUFACTURER_ROLE) returns (uint256) {
        return
            _mintBatchInternal(
                to,
                batchNumber,
                manufacturerName,
                "Unknown Product",
                uint64(block.timestamp),
                uint64(expiryTimestamp),
                apiHash,
                keccak256(bytes(tokenURI)),
                tokenURI,
                manufacturerSignature
            );
    }

    function mintBatchWithCompliance(
        address to,
        string calldata batchNumber,
        string calldata manufacturerName,
        string calldata productName,
        uint64 mfgDate,
        uint64 expiryTimestamp,
        string calldata apiHash,
        bytes32 packagingHash,
        string calldata tokenURI,
        bytes calldata manufacturerSignature
    ) external whenNotPaused onlyRole(MANUFACTURER_ROLE) returns (uint256) {
        return
            _mintBatchInternal(
                to,
                batchNumber,
                manufacturerName,
                productName,
                mfgDate,
                expiryTimestamp,
                apiHash,
                packagingHash,
                tokenURI,
                manufacturerSignature
            );
    }

    function _mintBatchInternal(
        address to,
        string memory batchNumber,
        string memory manufacturerName,
        string memory productName,
        uint64 mfgDate,
        uint64 expiryTimestamp,
        string memory apiHash,
        bytes32 packagingHash,
        string memory tokenURI,
        bytes memory manufacturerSignature
    ) internal returns (uint256) {
        ManufacturerProfile memory profile = manufacturers[msg.sender];
        require(profile.active, "Manufacturer inactive");
        require(bytes(profile.licenseNo).length > 0, "Manufacturer license missing");
        require(to != address(0), "Invalid recipient");
        require(expiryTimestamp > block.timestamp, "Expiry must be future");
        require(mfgDate <= expiryTimestamp, "Invalid mfg/expiry");
        require(manufacturerSignature.length > 0, "Manufacturer signature required");

        bytes32 payloadHash = keccak256(
            abi.encode(
                batchNumber,
                manufacturerName,
                productName,
                mfgDate,
                expiryTimestamp,
                apiHash,
                packagingHash,
                to,
                address(this),
                block.chainid
            )
        );

        address recovered = ECDSA.recover(payloadHash.toEthSignedMessageHash(), manufacturerSignature);
        require(recovered == msg.sender, "Invalid manufacturer signature");

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        _mint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);

        batches[tokenId] = Batch({
            productName: productName,
            manufacturerName: manufacturerName,
            manufacturerLicenseNo: profile.licenseNo,
            batchNumber: batchNumber,
            mfgDate: mfgDate,
            expiryTimestamp: expiryTimestamp,
            apiHash: apiHash,
            packagingHash: packagingHash,
            currentOwnerType: "Manufacturer",
            currentCustodian: to,
            lastVerified: uint64(block.timestamp),
            modelHash: "",
            openReports: 0,
            pendingSevereReports: 0,
            quarantined: false,
            flaggedHighRisk: false
        });

        totalBatchesMinted += 1;

        emit BatchMinted(tokenId, batchNumber, productName, profile.licenseNo);
        return tokenId;
    }

    function transferToNextOwner(
        uint256 tokenId,
        address newOwner,
        string memory newOwnerType
    ) public whenNotPaused {
        _requireBatchExists(tokenId);
        require(ownerOf(tokenId) == msg.sender, "Not token owner");

        _transfer(msg.sender, newOwner, tokenId);

        batches[tokenId].currentOwnerType = newOwnerType;
        batches[tokenId].currentCustodian = newOwner;
        batches[tokenId].lastVerified = uint64(block.timestamp);

        emit BatchOwnershipMoved(tokenId, newOwner, newOwnerType);
    }

    function recordCustodyCheckpoint(
        uint256 tokenId,
        bytes32 locationHash,
        string calldata ownerType
    ) external whenNotPaused {
        _requireBatchExists(tokenId);
        require(
            ownerOf(tokenId) == msg.sender || hasRole(INSPECTOR_ROLE, msg.sender) || hasRole(REGULATOR_ROLE, msg.sender),
            "Not authorized"
        );

        emit CustodyCheckpoint(tokenId, msg.sender, locationHash, ownerType, uint64(block.timestamp));
    }

    function submitLabAttestation(
        uint256 tokenId,
        bytes32 reportHash,
        bool passed,
        uint16 confidenceBps
    ) external whenNotPaused onlyRole(LAB_ROLE) {
        _requireBatchExists(tokenId);
        require(labs[msg.sender].active, "Lab inactive");
        require(confidenceBps <= BPS_DENOMINATOR, "Invalid confidence");

        _labAttestationsByBatch[tokenId].push(
            LabAttestation({
                lab: msg.sender,
                reportHash: reportHash,
                passed: passed,
                confidenceBps: confidenceBps,
                attestedAt: uint64(block.timestamp)
            })
        );

        batches[tokenId].lastVerified = uint64(block.timestamp);
        if (!passed) {
            _setHighRisk(tokenId, true);
        }

        emit LabAttestationSubmitted(tokenId, msg.sender, reportHash, passed, confidenceBps);
    }

    function updateFederatedModel(uint256 tokenId, string memory newModelHash) public whenNotPaused {
        _requireBatchExists(tokenId);
        require(
            hasRole(LAB_ROLE, msg.sender) || hasRole(REGULATOR_ROLE, msg.sender),
            "Not authorized"
        );

        batches[tokenId].modelHash = newModelHash;
        batches[tokenId].lastVerified = uint64(block.timestamp);
        emit AIFederatedUpdate(tokenId, newModelHash, msg.sender);
    }

    function setBatchQuarantine(
        uint256 tokenId,
        bool quarantined,
        string calldata reasonCode
    ) external whenNotPaused onlyRole(REGULATOR_ROLE) {
        _requireBatchExists(tokenId);

        batches[tokenId].quarantined = quarantined;
        if (quarantined) {
            _setHighRisk(tokenId, true);
        } else if (batches[tokenId].pendingSevereReports == 0) {
            _setHighRisk(tokenId, false);
        }

        emit BatchQuarantineUpdated(tokenId, quarantined, reasonCode);
    }

    function reportSuspiciousBatch(
        uint256 tokenId,
        bytes32 identityNullifier,
        string calldata evidenceURI,
        string calldata reason,
        uint8 severity
    ) external payable whenNotPaused nonReentrant returns (uint256) {
        _requireBatchExists(tokenId);
        require(identityNullifier != bytes32(0), "Identity nullifier required");
        require(!identityNullifierUsed[identityNullifier], "Nullifier already used");
        require(severity >= 1 && severity <= 3, "Severity must be 1-3");

        ReporterProfile storage reporter = reporterProfiles[msg.sender];
        require(!reporter.blocked, "Reporter blocked");
        require(!hasOpenReportForBatch[msg.sender][tokenId], "Open report already exists for this batch");
        require(reporter.openReports < maxOpenReportsPerReporter, "Too many open reports");

        if (reporter.lastReportAt != 0) {
            require(
                block.timestamp >= uint256(reporter.lastReportAt) + reportCooldownSec,
                "Reporter cooldown active"
            );
        }

        if (severity == 3) {
            require(
                reporter.reputation >= minReputationForSeverityThree,
                "Reputation too low for severity-3"
            );
        }

        uint256 requiredStake = _requiredStake(severity);
        require(msg.value >= requiredStake, "Stake too low");

        uint256 reportId = _reportIdCounter;
        _reportIdCounter++;

        reports[reportId] = FakeReport({
            reportId: reportId,
            tokenId: tokenId,
            reporter: msg.sender,
            identityNullifier: identityNullifier,
            evidenceURI: evidenceURI,
            reason: reason,
            severity: severity,
            stakeAmount: msg.value,
            createdAt: uint64(block.timestamp),
            resolvedAt: 0,
            status: ReportStatus.Pending,
            resolver: address(0)
        });

        identityNullifierUsed[identityNullifier] = true;
        _reportsByBatch[tokenId].push(reportId);
        hasOpenReportForBatch[msg.sender][tokenId] = true;

        reporter.reportsSubmitted += 1;
        reporter.openReports += 1;
        reporter.lastReportAt = uint64(block.timestamp);

        batches[tokenId].openReports += 1;
        if (severity == 3) {
            batches[tokenId].pendingSevereReports += 1;
            _setHighRisk(tokenId, true);
        }

        totalReportsFiled += 1;
        totalOpenReports += 1;

        emit SuspiciousBatchReported(reportId, tokenId, msg.sender, severity, msg.value);
        return reportId;
    }

    function resolveReport(uint256 reportId, bool confirmedFake)
        external
        whenNotPaused
        onlyRole(REGULATOR_ROLE)
        nonReentrant
    {
        FakeReport storage report = reports[reportId];
        require(report.reporter != address(0), "Unknown report");
        require(report.status == ReportStatus.Pending, "Already resolved");

        Batch storage batch = batches[report.tokenId];
        ReporterProfile storage reporter = reporterProfiles[report.reporter];

        report.resolver = msg.sender;
        report.resolvedAt = uint64(block.timestamp);

        if (batch.openReports > 0) {
            batch.openReports -= 1;
        }
        if (report.severity == 3 && batch.pendingSevereReports > 0) {
            batch.pendingSevereReports -= 1;
        }

        if (reporter.openReports > 0) {
            reporter.openReports -= 1;
        }

        hasOpenReportForBatch[report.reporter][report.tokenId] = false;

        if (totalOpenReports > 0) {
            totalOpenReports -= 1;
        }

        uint256 payoutWei;

        if (confirmedFake) {
            report.status = ReportStatus.ConfirmedFake;
            totalConfirmedFakeReports += 1;

            reporter.reportsConfirmed += 1;
            reporter.reputation += int256(uint256(10 + (uint256(report.severity) * 4)));

            payoutWei = report.stakeAmount;

            uint256 rewardWei = baseRewardWei * uint256(report.severity);
            if (rewardWei > bountyPoolWei) {
                rewardWei = bountyPoolWei;
            }

            if (rewardWei > 0) {
                bountyPoolWei -= rewardWei;
                payoutWei += rewardWei;
            }

            batch.quarantined = true;
            _setHighRisk(report.tokenId, true);
        } else {
            report.status = ReportStatus.RejectedFalse;

            reporter.reportsRejected += 1;
            reporter.reputation -= int256(uint256(12 + (uint256(report.severity) * 6)));

            uint256 slashedWei = (report.stakeAmount * falseReportSlashBps) / BPS_DENOMINATOR;
            bountyPoolWei += slashedWei;
            payoutWei = report.stakeAmount - slashedWei;

            if (!batch.quarantined && batch.pendingSevereReports == 0) {
                _setHighRisk(report.tokenId, false);
            }

            if (reporter.reputation <= -100) {
                reporter.blocked = true;
                emit ReporterBlocked(report.reporter, true);
            }
        }

        if (payoutWei > 0) {
            (bool sent, ) = payable(report.reporter).call{value: payoutWei}("");
            require(sent, "Payout failed");
        }

        emit ReportResolved(reportId, confirmedFake, payoutWei, reporter.reputation);
    }

    function verifyBatch(uint256 tokenId) public view returns (bool isValid, string memory risk) {
        _requireBatchExists(tokenId);
        Batch memory b = batches[tokenId];

        if (block.timestamp > b.expiryTimestamp) {
            return (false, "Expired");
        }
        if (b.quarantined) {
            return (false, "Regulator quarantined");
        }
        if (b.flaggedHighRisk) {
            return (false, "High-risk batch");
        }
        if (b.openReports > 0) {
            return (true, "Under investigation");
        }
        if (bytes(b.modelHash).length == 0) {
            return (true, "No model attestation yet");
        }

        return (true, "Clean");
    }

    function getBatchCompliance(uint256 tokenId)
        external
        view
        returns (
            string memory productName,
            string memory manufacturerName,
            string memory manufacturerLicenseNo,
            string memory batchNumber,
            uint64 mfgDate,
            uint64 expiryTimestamp,
            string memory apiHash,
            bytes32 packagingHash,
            bool quarantined,
            bool flaggedHighRisk
        )
    {
        _requireBatchExists(tokenId);
        Batch memory b = batches[tokenId];

        return (
            b.productName,
            b.manufacturerName,
            b.manufacturerLicenseNo,
            b.batchNumber,
            b.mfgDate,
            b.expiryTimestamp,
            b.apiHash,
            b.packagingHash,
            b.quarantined,
            b.flaggedHighRisk
        );
    }

    function getLabAttestations(uint256 tokenId) external view returns (LabAttestation[] memory) {
        _requireBatchExists(tokenId);
        return _labAttestationsByBatch[tokenId];
    }

    function getReportsForBatch(uint256 tokenId) external view returns (uint256[] memory) {
        _requireBatchExists(tokenId);
        return _reportsByBatch[tokenId];
    }

    function getDashboardSummary()
        external
        view
        returns (
            uint256 minted,
            uint256 reportsFiled,
            uint256 openReports,
            uint256 highRiskBatches,
            uint256 confirmedFakeReports,
            uint256 poolBalanceWei
        )
    {
        minted = totalBatchesMinted;
        reportsFiled = totalReportsFiled;
        openReports = totalOpenReports;
        highRiskBatches = _highRiskBatchIds.length;
        confirmedFakeReports = totalConfirmedFakeReports;
        poolBalanceWei = bountyPoolWei;
    }

    function getHighRiskBatchIds(
        uint256 cursor,
        uint256 limit
    ) external view returns (uint256[] memory ids, uint256 nextCursor) {
        if (limit == 0 || cursor >= _highRiskBatchIds.length) {
            return (new uint256[](0), cursor);
        }

        uint256 endExclusive = cursor + limit;
        if (endExclusive > _highRiskBatchIds.length) {
            endExclusive = _highRiskBatchIds.length;
        }

        uint256 length = endExclusive - cursor;
        ids = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            ids[i] = _highRiskBatchIds[cursor + i];
        }

        nextCursor = endExclusive;
    }

    function pause() external onlyRole(REGULATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(REGULATOR_ROLE) {
        _unpause();
    }

    function _setHighRisk(uint256 tokenId, bool highRisk) internal {
        bool current = batches[tokenId].flaggedHighRisk;
        if (current == highRisk) {
            return;
        }

        batches[tokenId].flaggedHighRisk = highRisk;

        if (highRisk) {
            _highRiskBatchIds.push(tokenId);
            _highRiskIndexPlusOne[tokenId] = _highRiskBatchIds.length;
        } else {
            uint256 indexPlusOne = _highRiskIndexPlusOne[tokenId];
            if (indexPlusOne > 0) {
                uint256 index = indexPlusOne - 1;
                uint256 lastIndex = _highRiskBatchIds.length - 1;

                if (index != lastIndex) {
                    uint256 movedTokenId = _highRiskBatchIds[lastIndex];
                    _highRiskBatchIds[index] = movedTokenId;
                    _highRiskIndexPlusOne[movedTokenId] = index + 1;
                }

                _highRiskBatchIds.pop();
                _highRiskIndexPlusOne[tokenId] = 0;
            }
        }

        emit HighRiskFlagUpdated(tokenId, highRisk);
    }

    function _requiredStake(uint8 severity) internal view returns (uint256) {
        if (severity == 1) {
            return minStakeWei;
        }
        if (severity == 2) {
            return mediumStakeWei;
        }
        return highStakeWei;
    }

    function _requireBatchExists(uint256 tokenId) internal view {
        require(_ownerOf(tokenId) != address(0), "Unknown batch");
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

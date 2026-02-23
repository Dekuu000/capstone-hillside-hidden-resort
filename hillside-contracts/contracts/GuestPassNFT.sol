// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC721 implementation for reservation guest passes.
/// @dev Keeps only reservation hash on-chain (no guest PII).
contract GuestPassNFT {
    string private _name;
    string private _symbol;
    string private _baseTokenUri;
    address public owner;
    uint256 public nextTokenId = 1;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(address => bool) public minters;

    mapping(bytes32 => uint256) public reservationToken;
    mapping(uint256 => bytes32) public tokenReservationHash;

    bytes4 private constant _INTERFACE_ID_ERC165 = 0x01ffc9a7;
    bytes4 private constant _INTERFACE_ID_ERC721 = 0x80ac58cd;
    bytes4 private constant _INTERFACE_ID_ERC721_METADATA = 0x5b5e139f;
    bytes4 private constant _ERC721_RECEIVED = 0x150b7a02;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event GuestPassMinted(
        uint256 indexed tokenId,
        bytes32 indexed reservationHash,
        address indexed recipient,
        address operator,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "owner only");
        _;
    }

    modifier onlyMinter() {
        require(minters[msg.sender], "minter only");
        _;
    }

    constructor(string memory name_, string memory symbol_, string memory baseTokenUri_) {
        owner = msg.sender;
        minters[msg.sender] = true;
        _name = name_;
        _symbol = symbol_;
        _baseTokenUri = baseTokenUri_;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == _INTERFACE_ID_ERC165
            || interfaceId == _INTERFACE_ID_ERC721
            || interfaceId == _INTERFACE_ID_ERC721_METADATA;
    }

    function name() external view returns (string memory) {
        return _name;
    }

    function symbol() external view returns (string memory) {
        return _symbol;
    }

    function balanceOf(address account) public view returns (uint256) {
        require(account != address(0), "zero address");
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address tokenOwner = _owners[tokenId];
        require(tokenOwner != address(0), "token not found");
        return tokenOwner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0), "token not found");
        if (bytes(_baseTokenUri).length == 0) {
            return "";
        }
        return string(abi.encodePacked(_baseTokenUri, _toString(tokenId)));
    }

    function setBaseTokenUri(string calldata nextBaseUri) external onlyOwner {
        _baseTokenUri = nextBaseUri;
    }

    function setMinter(address account, bool enabled) external onlyOwner {
        require(account != address(0), "zero address");
        minters[account] = enabled;
    }

    function mintGuestPass(address recipient, bytes32 reservationHash)
        external
        onlyMinter
        returns (uint256 tokenId)
    {
        require(recipient != address(0), "zero recipient");
        require(reservationHash != bytes32(0), "reservation hash required");
        require(reservationToken[reservationHash] == 0, "reservation already minted");

        tokenId = nextTokenId;
        nextTokenId += 1;

        reservationToken[reservationHash] = tokenId;
        tokenReservationHash[tokenId] = reservationHash;
        _safeMint(recipient, tokenId, "");

        emit GuestPassMinted(tokenId, reservationHash, recipient, msg.sender, block.timestamp);
    }

    function approve(address to, uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        require(
            msg.sender == tokenOwner || isApprovedForAll(tokenOwner, msg.sender),
            "not authorized"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        require(_owners[tokenId] != address(0), "token not found");
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        require(operator != msg.sender, "self operator");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address tokenOwner, address operator) public view returns (bool) {
        return _operatorApprovals[tokenOwner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "not authorized");
        require(ownerOf(tokenId) == from, "from mismatch");
        require(to != address(0), "zero recipient");
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "receiver not ERC721");
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address tokenOwner = ownerOf(tokenId);
        return (
            spender == tokenOwner
                || spender == getApproved(tokenId)
                || isApprovedForAll(tokenOwner, spender)
        );
    }

    function _safeMint(address to, uint256 tokenId, bytes memory data) internal {
        _mint(to, tokenId);
        require(_checkOnERC721Received(address(0), to, tokenId, data), "receiver not ERC721");
    }

    function _mint(address to, uint256 tokenId) internal {
        require(to != address(0), "zero recipient");
        require(_owners[tokenId] == address(0), "token exists");
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        delete _tokenApprovals[tokenId];
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private returns (bool) {
        if (to.code.length == 0) {
            return true;
        }
        (bool ok, bytes memory returndata) = to.call(
            abi.encodeWithSelector(_ERC721_RECEIVED, msg.sender, from, tokenId, data)
        );
        if (!ok || returndata.length < 32) {
            return false;
        }
        bytes4 retval = abi.decode(returndata, (bytes4));
        return retval == _ERC721_RECEIVED;
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits += 1;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}

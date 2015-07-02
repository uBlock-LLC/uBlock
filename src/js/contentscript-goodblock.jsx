console.log('Goodblock content script.');

var GoodblockRootElem = React.createClass({
	render: function() {
		var id = 'goodblockBaseElem';
		var content = 'Goodblock!';
		var style = {
			position: 'fixed !important',
			bottom: '10px !important',
			left: '10px !important',
			width: '100px !important',
			height: '100px !important',
			display: 'block !important',
			zIndex: '10000000 !important',
			backgroundColor: '#E2E2E2 !important',
			padding: '10px !important',
		};
		return (
			<div
				id={id}
				style={style}
				dataGoodblockElem='true'>
					{content}
			</div>
		);
	}
});

var reactBaseElem = document.createElement('div');
var reactBaseElemId = 'react-base';
reactBaseElem.id = reactBaseElemId;
document.body.appendChild(reactBaseElem);
React.render(<GoodblockRootElem />, document.getElementById(reactBaseElemId));
